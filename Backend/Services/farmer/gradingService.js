/**
 * Grading Service
 * Calculates FreshRoute prices based on economic center prices and quality grades
 * Grade A: Premium (max price + 2%)
 * Grade B: High (high-mid price + 2%)
 * Grade C: Medium (low-mid price + 2%)
 * Grade D: Budget (min price + 2%)
 */

const GRADES = ['A', 'B', 'C', 'D'];
const MARGIN_PCT = 0.02; // 2% markup

/**
 * Calculate price for a specific grade based on min/max price range
 * @param {number} minPrice - Minimum price from economic center
 * @param {number} maxPrice - Maximum price from economic center
 * @param {string} grade - Grade level (A, B, C, D)
 * @param {number} marginPct - Markup percentage (default 0.02)
 * @returns {number} - Calculated price rounded to nearest integer
 */
function calculateGradePrice(minPrice, maxPrice, grade, marginPct = MARGIN_PCT) {
  if (!minPrice || !maxPrice) {
    return null;
  }

  const min = Number(minPrice);
  const max = Number(maxPrice);
  const margin = marginPct || MARGIN_PCT;

  let basePrice;

  // Calculate base price based on grade
  switch (grade) {
    case 'A':
      // Premium: use maximum price
      basePrice = max;
      break;
    case 'B':
      // High: use high-mid price (average of mid and max)
      const midPrice = (min + max) / 2;
      basePrice = (midPrice + max) / 2;
      break;
    case 'C':
      // Medium: use low-mid price (average of min and mid)
      const mid = (min + max) / 2;
      basePrice = (min + mid) / 2;
      break;
    case 'D':
      // Budget: use minimum price
      basePrice = min;
      break;
    default:
      return null;
  }

  // Apply markup and round to nearest integer
  const finalPrice = basePrice * (1 + margin);
  return Math.round(finalPrice);
}

/**
 * Generate all grades for a fruit with economic center prices
 * @param {object} fruit - Fruit object with id, name, variety
 * @param {number} minPrice - Min price from economic center
 * @param {number} maxPrice - Max price from economic center
 * @param {string} targetDate - Target date for pricing
 * @returns {array} - Array of grade objects
 */
function generateAllGrades(fruit, minPrice, maxPrice, targetDate) {
  return GRADES.map(grade => ({
    fruit_id: fruit.id,
    fruit_name: fruit.name,
    variety: fruit.variety || null,
    grade,
    target_date: targetDate,
    price: calculateGradePrice(minPrice, maxPrice, grade),
    source_min_price: minPrice,
    source_max_price: maxPrice,
    margin_pct: MARGIN_PCT,
  }));
}

/**
 * Get grade tier description for display
 * @param {string} grade - Grade level
 * @returns {string} - Human-readable description
 */
function getGradeDescription(grade) {
  const descriptions = {
    'A': 'Premium (Max Price)',
    'B': 'High Quality (Mid-High)',
    'C': 'Standard (Mid-Low)',
    'D': 'Budget (Min Price)',
  };
  return descriptions[grade] || 'Unknown';
}

/**
 * Validate grade
 * @param {string} grade - Grade to validate
 * @returns {boolean}
 */
function isValidGrade(grade) {
  return GRADES.includes(grade);
}

module.exports = {
  GRADES,
  MARGIN_PCT,
  calculateGradePrice,
  generateAllGrades,
  getGradeDescription,
  isValidGrade,
};
