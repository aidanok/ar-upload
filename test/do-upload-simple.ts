import chai from 'chai' ;

import { doUpload } from '../src';
import { MockSourceEnvironment, MockTargetEnvironment } from './_mock_environments';
import { Upload } from '../src/upload';
import { TxUpload } from '../src/tx-upload';


const expect = chai.expect;

describe('doUpload', function() {
  it('should check the status of a resumed upload', async () => {
    const sourceEnv = new MockSourceEnvironment();
    const targetEnv = new MockTargetEnvironment(); 
    
    const timeScale = 0.0125;
    const itemCount = 30;

    targetEnv.orphanChance = 0;
    
    const items: string[] = [];

    for (let i = 0; i < itemCount; i++) {
      items.push(`random_file_name_${i}.foo`);
    }

    // Do an upload where we will post all TXs immediately, then break from the iteration, 
    // mine some of these pending TXs, and do another single iteration 
    // we should see that we have checked the status of these and moved them into 'mined' state. 

    let upload = new Upload(items, { maxPendingBytes: 1024 * 1024 * 400, maxPendingTxs: 100 });

    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      break; 
    }

    expect(upload.pending.length).to.eq(itemCount);

    // Serialize
    const serialized = JSON.stringify(upload); 
    
    // Mine some blocks while we are serialized. 
    targetEnv.mineBlock(5);
    
    // De-serialize
    upload = Upload.fromJSON(serialized);
    
    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      break; 
    }

    expect(upload.mined.length).to.eq(5);
    expect(upload.pending.length).to.eq(25);
    

  })
})