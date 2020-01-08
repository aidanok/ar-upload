Ar-Upload
=========

Library to help with uploading many transactions and ensure they get confirmed to N confirms
before finishing.

Has no dependencies on arweave-js or any filesystem, the source and target environment
are configured and passed in as configuration, so it can be used in any (JavaScript)
environment (Browser + Arweave-Js, Browser + Extension, NodeJs FS + Arweave-Js, etc)

Other things...

- Rate limits uploads with quota of MB in-flight and TX count in-flight at once
- Configurable number of confirms required before finishing
- Re-submits TXs that get orphaned before reaching the required number of confirms.
- Async iterator interface for easy access to progress of upload
- Progress of upload is serializable at each step, allowing for pause/resume/recovery
- Optionally provide a deduplication function that gives an already existing TX ID.

Hand wavy example usage:

```typescript

let progress = new Upload(['myfile0.foo', 'myfile1.foo'])

for await (progress of doUpload(sourceEnv, targetEnv, progress)) {
  // print progress and/or save progress, or just do nothing and keep looping until we are done.
  
}

progress.complete // list of identifiers (filenames) and corresponding txids, that have required number of confirms

```

To run a sample, simulation with mock source and target environments and sped up time:

```bash
export DEBUG="mock-env:*" # Debug messages about the mock env (simulated orphaned blocks)
npx ts-node examples/example0.ts

```

```bash
export DEBUG="mock-env:*,do-upload:*" # More verbose debug messages about the queing & progress too.
npm run test
```

NOTE: The only environments included at the moment are some mock environments for testing, the mock target environment randomly orphans blocks, the mock source environment just provides a randomly sized chunk of bytes
when asked for any filename/identifier.

