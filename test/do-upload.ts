import chai from 'chai' ;

import { doUpload } from '../src';
import { MockSourceEnvironment, MockTargetEnvironment } from './_mock_environments';
import { DEFAULT_OPTIONS } from '../src';
import { Upload } from '../src/upload';
import { TxUpload } from '../src/tx-upload';

const expect = chai.expect;

describe('post-many tests', function() {
  
  this.timeout(1000*60*500);

  it('should complete with 30 items and never have more than maxPending[bytes|txs] in flight', async () => {
      
    const sourceEnv = new MockSourceEnvironment();
    const targetEnv = new MockTargetEnvironment(); 
    const options = Object.assign({}, DEFAULT_OPTIONS);

    const timeScale = 0.025;
    const itemCount = 30;
    
    // Make things move a bit faster for testing.
    options.pollTime = options.pollTime * timeScale;
    targetEnv.blockTimeSeconds = targetEnv.blockTimeSeconds * timeScale

    options.maxPendingBytes = 1024 * 1024 * 40;
    options.maxPendingTxs = 10;

    
    const identifiers: string[] = [];

    for (let i = 0; i < itemCount; i++) {
      identifiers.push(`random_file_name_${i}.foo`);
    }

    let upload = new Upload(identifiers, options);

    const asyncIterator = doUpload(sourceEnv, targetEnv, upload); 

    let queued: TxUpload[] = [];
    let pending: TxUpload[] = [];
    let mined: TxUpload[] = [];
    let complete: TxUpload[] = [];    

    for await ( {queued, pending, mined, complete } of asyncIterator) {
      const bytesPending = pending.reduce((total, txp) => total += txp.byteSize, 0);
      expect(pending.length).to.be.lte(options.maxPendingTxs);
      expect(bytesPending).to.be.lte(options.maxPendingBytes);
    }

    expect(queued.length).to.eq(0);
    expect(pending.length).to.eq(0);
    expect(mined.length).to.eq(0);
    expect(complete.length).to.eq(itemCount);
    complete.forEach(txp => expect(txp.confirmations).to.eq(options.confirmationsRequired));

  })
})