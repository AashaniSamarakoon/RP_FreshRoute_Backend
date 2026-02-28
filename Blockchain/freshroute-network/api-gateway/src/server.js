const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const fabricService = require('./services/fabricService');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(
    cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        credentials: true,
    }),
);

// Rate limiting - production best practice
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
});
app.use('/api/', limiter);

// Middleware
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
    morgan('combined', {
        stream: { write: (message) => logger.info(message.trim()) },
    }),
);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'FreshRoute API Gateway',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

// API Routes
const apiRouter = express.Router();

// Query all assets
apiRouter.get('/assets', async (req, res) => {
    try {
        const result = await fabricService.query('GetAllAssets', []);
        res.json({ success: true, data: JSON.parse(result) });
    } catch (error) {
        logger.error('Error querying assets:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Query asset by ID
apiRouter.get('/assets/:id', async (req, res) => {
    try {
        const result = await fabricService.query('ReadAsset', [req.params.id]);
        res.json({ success: true, data: JSON.parse(result) });
    } catch (error) {
        logger.error(`Error reading asset ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create asset
apiRouter.post('/assets', async (req, res) => {
    try {
        const { id, color, size, owner, appraisedValue } = req.body;

        if (!id || !color || !size || !owner || !appraisedValue) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
            });
        }

        const result = await fabricService.invoke('CreateAsset', [
            id,
            color,
            size,
            owner,
            appraisedValue.toString(),
        ]);

        res.status(201).json({
            success: true,
            transactionId: result,
            data: { id, color, size, owner, appraisedValue },
        });
    } catch (error) {
        logger.error('Error creating asset:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update asset
apiRouter.put('/assets/:id', async (req, res) => {
    try {
        const { color, size, owner, appraisedValue } = req.body;

        const result = await fabricService.invoke('UpdateAsset', [
            req.params.id,
            color,
            size,
            owner,
            appraisedValue.toString(),
        ]);

        res.json({
            success: true,
            transactionId: result,
            message: `Asset ${req.params.id} updated successfully`,
        });
    } catch (error) {
        logger.error(`Error updating asset ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Transfer asset
apiRouter.post('/assets/:id/transfer', async (req, res) => {
    try {
        const { newOwner } = req.body;

        if (!newOwner) {
            return res.status(400).json({
                success: false,
                error: 'newOwner is required',
            });
        }

        const result = await fabricService.invoke('TransferAsset', [
            req.params.id,
            newOwner,
        ]);

        res.json({
            success: true,
            transactionId: result,
            message: `Asset ${req.params.id} transferred to ${newOwner}`,
        });
    } catch (error) {
        logger.error(`Error transferring asset ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete asset
apiRouter.delete('/assets/:id', async (req, res) => {
    try {
        const result = await fabricService.invoke('DeleteAsset', [
            req.params.id,
        ]);

        res.json({
            success: true,
            transactionId: result,
            message: `Asset ${req.params.id} deleted successfully`,
        });
    } catch (error) {
        logger.error(`Error deleting asset ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Asset history
apiRouter.get('/assets/:id/history', async (req, res) => {
    try {
        const result = await fabricService.query('GetAssetHistory', [
            req.params.id,
        ]);
        res.json({ success: true, data: JSON.parse(result) });
    } catch (error) {
        logger.error(
            `Error getting history for asset ${req.params.id}:`,
            error,
        );
        res.status(500).json({ success: false, error: error.message });
    }
});

app.use('/api', apiRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
    });
});

// Start server
const startServer = async () => {
    try {
        await fabricService.connect();
        logger.info('Connected to Fabric network');

        app.listen(PORT, () => {
            logger.info(`FreshRoute API Gateway listening on port ${PORT}`);
            logger.info(`Health check: http://localhost:${PORT}/health`);
            logger.info(`API docs: http://localhost:${PORT}/api`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    await fabricService.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    await fabricService.disconnect();
    process.exit(0);
});

startServer();

module.exports = app;
