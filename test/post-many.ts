import chai from 'chai' ;

import { multiUpload, TxPostProgress } from '../src/';
import { MockSourceEnvironment, MockTargetEnvironment } from './_mock_environments';
import { DEFAULT_OPTIONS } from '../src/';

const expect = chai.expect;

describe('post-many tests', function() {
  
  this.timeout(1000*60*500);

  it('should complete with 30 items and never had more than maxPending[bytes|txs] in flight', async () => {
      
    const sourceEnv = new MockSourceEnvironment();
    const targetEnv = new MockTargetEnvironment(); 
    const options = Object.assign({}, DEFAULT_OPTIONS);

    const timeScale = 0.05;
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

    const asyncIterator = multiUpload(sourceEnv, targetEnv, identifiers, options); 

    
    let queued: TxPostProgress[] = [];
    let pending: TxPostProgress[] = [];
    let mined: TxPostProgress[] = [];
    let confirmed: TxPostProgress[] = [];
    

    for await ( {queued, pending, mined, confirmed } of asyncIterator) {
      const bytesPending = pending.reduce((total, txp) => total += txp.byteSize, 0);
      expect(pending.length).to.be.lte(options.maxPendingTxs);
      expect(bytesPending).to.be.lte(options.maxPendingBytes);
    }

    expect(queued.length).to.eq(0);
    expect(pending.length).to.eq(0);
    expect(mined.length).to.eq(0);
    expect(confirmed.length).to.eq(itemCount);
    confirmed.forEach(txp => expect(txp.confirmations).to.eq(options.confirmationsRequired));

  })
})