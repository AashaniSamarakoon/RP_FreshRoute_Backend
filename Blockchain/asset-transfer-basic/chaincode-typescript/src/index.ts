/*
 * SPDX-License-Identifier: Apache-2.0
 */

import {type Contract} from 'fabric-contract-api';
// import {AssetTransferContract} from './assetTransfer';
import { UserContract } from './contracts/UserContract';
import { StockContract } from './contracts/StockContract';
import { OrderContract } from './contracts/OrderContract';
// import { LogisticsContract } from './contracts/LogisticsContract';
// import { PaymentContract } from './contracts/PaymentContract';

export const contracts: typeof Contract[] = [
    UserContract,
    StockContract,
    OrderContract,
    // LogisticsContract,
    // PaymentContract
];
