import { doUpload } from "../src/main";
import { MockSourceEnvironment, MockTargetEnvironment } from "../test/_mock_environments";

import colors from "colors";
import { DEFAULT_OPTIONS } from "../src/options";
import { Upload } from "../src/upload";

async function runDemo() {

  const sourceEnv = new MockSourceEnvironment();
  const targetEnv = new MockTargetEnvironment();
  const options = Object.assign({}, DEFAULT_OPTIONS);
  options.maxPendingBytes = 50 * 1024 * 1024;
  options.maxPendingTxs = 12;

  const timeScale = 0.1;
  const itemCount = 20;

  // Make things move a bit faster for demo.
  options.pollTime = options.pollTime * timeScale;
  targetEnv.blockTimeSeconds = targetEnv.blockTimeSeconds * timeScale;

  // Set up some random files, the MockSourceEnvironment just gives 
  // some random bytes for any identifier.
  const randomFiles: string[] = [];
  for (let i = 0; i < itemCount; i++) {
    randomFiles.push(`random_file_${i}.bin`);
  }

  console.log(colors.cyan(`Simulating ${itemCount} TXs with random sizes`));
  console.log(colors.cyan(`Waiting for ${options.confirmationsRequired} confirms`));
  console.log(colors.cyan(`Maximum of ${(options.maxPendingBytes / 1024 / 1024).toFixed(2)}MiB or ${options.maxPendingTxs} TXs in-flight at once`));

  let progress = new Upload(randomFiles, options); 

  for await (progress of doUpload(sourceEnv, targetEnv, progress)) {
    
    // Print some info.
    const ql = colors.cyan(progress.queued.length.toString());
    const pl = colors.grey(progress.pending.length.toString());
    const ml = colors.green.dim(progress.mined.length.toString());
    const cl = colors.green(progress.complete.length.toString());
    const pendingMb = (progress.pendingBytes / 1024 / 1024).toFixed(2);
    
    console.log(`Queued:${ql}, Pending:${pl} (${pendingMb} MiB), Mined:${ml}, Completed:${cl}`);
  }
}

runDemo();
