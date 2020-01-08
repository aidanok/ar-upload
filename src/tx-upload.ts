import { TransactionParameters } from "./transaction-parameters";

export interface TxUpload {
  identifier: string;
  order: number;
  id: null | string;
  confirmations: number;
  status: number;
  transaction: null | TransactionParameters;
  byteSize: number;

}
