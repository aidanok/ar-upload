import { Options } from "./options";
import { TxUpload } from "./tx-upload";

/**
 * Serializable data structure that holds the current
 * state and options of an Upload. It has a couple of helper
 * methods for construction and reading data, but does not contain
 * any other logic.
 *
 * It can be serialized by calling JSON.stringify() and de-serialized
 * by calling one of the static fromJSON methods.
 *
 */
export class Upload implements Options {
  maxPendingBytes: number = 40 * 1024 * 1024;
  maxPendingTxs: number = 40;
  pollTime: number = 20;
  confirmationsRequired: number = 4;
  MAX_TX_SIZE: number = 10 * 1024 * 1024;

  private all: TxUpload[] = [];

  public constructor(items: string[] = [], options: Partial<Options> = {}) {
    Object.assign(this, options);
    this.all = items.map(item => ({
      item,
      id: null,
      confirmations: -1,
      status: 404,
      transaction: null,
      byteSize: 0,
      order: 0
    }));
  }

  public additems(items: string[], order = 0) {
    this.all.push(
      ...items.map(item => ({
        item,
        id: null,
        confirmations: -1,
        status: 404,
        transaction: null,
        byteSize: 0,
        order: 1
      }))
    );
  }

  // When serializing, we don't want to store the transaction
  // data which could be very large, so just make a copy and
  // overwrite transaction with null.
  public toJSON(): string {
    const copy = Object.assign({}, this, { all: this.all.map(x => Object.assign(x, { transaction: null })) });
    return JSON.stringify(copy);
  }

  public static fromJSON(json: string | Buffer, options?: Partial<Options>): Upload {
    return Upload.fromParsedJSON(JSON.parse(json.toString()), options);
  }

  public static fromParsedJSON(parsed: object, options?: Partial<Options>): Upload {
    const temp = new Upload();
    Object.assign(temp, parsed);
    Object.assign(temp, options);
    return temp;
  }

  public get queued(): TxUpload[] {
    return this.all.filter(isQueued);
  }

  public get pending(): TxUpload[] {
    return this.all.filter(isPending);
  }

  public get mined(): TxUpload[] {
    return this.all.filter(x => isMined(x, this.confirmationsRequired));
  }

  public get complete(): TxUpload[] {
    return this.all.filter(x => isComplete(x, this.confirmationsRequired));
  }

  public get queuedBytes(): number {
    return this.queued.reduce((total, x) => (total += x.byteSize), 0);
  }

  public get pendingBytes(): number {
    return this.pending.reduce((total, x) => (total += x.byteSize), 0);
  }

  public get minedBytes(): number {
    return this.mined.reduce((total, x) => (total += x.byteSize), 0);
  }

  public get completeBytes(): number {
    return this.complete.reduce((total, x) => (total += x.byteSize), 0);
  }
}

export const isQueued = (x: TxUpload) => x.status === 404;

export const isPending = (x: TxUpload) => x.status === 202;

export const isMined = (x: TxUpload, confirmationsRequired: number) => x.status === 200 && x.confirmations < confirmationsRequired;

export const isComplete = (x: TxUpload, confirmationsRequired: number) => x.status === 200 && x.confirmations >= confirmationsRequired;
