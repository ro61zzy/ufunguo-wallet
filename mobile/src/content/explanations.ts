// Explain Mode copy, kept in one place so it can be reviewed for accuracy.
// Every statement here should describe what the Rust wallet actually does.

export const explain = {
  onboarding: [
    {
      key: 'non-custodial',
      title: 'You hold the key',
      body: 'Ufunguo is non-custodial. Nobody else can move your bitcoin, and nobody can recover it for you. “Ufunguo” means “key” in Swahili.',
    },
    {
      key: 'phrase',
      title: 'Twelve words control the wallet',
      body: 'A 12-word recovery phrase (BIP39) is turned into a master key. Every address the wallet will ever use is derived from it, so whoever has the words has the bitcoin.',
    },
    {
      key: 'utxo',
      title: 'Coins, not an account balance',
      body: 'Bitcoin has no account balances. Your wallet owns separate unspent outputs (UTXOs) — like notes in a purse — and your balance is their sum.',
    },
    {
      key: 'regtest',
      title: 'Practice money only',
      body: 'This version runs on regtest, a private test chain on your computer. The coins have no value, so you can experiment safely.',
    },
  ],

  afterCreate:
    'Rust generated 128 bits of randomness, encoded them as 12 BIP39 words, derived a BIP32 master key and created BIP84 receive and change descriptors. Only the public descriptors were saved to SQLite — the words were not.',

  afterRestore:
    'Rust validated the words against the BIP39 word list and checksum, derived the same master key and rebuilt the same BIP84 descriptors. Because derivation is deterministic, the same words always produce the same addresses.',

  afterReceive:
    'Ufunguo revealed the next address from your external BIP84 keychain and saved the new derivation index in SQLite.',

  afterSync:
    'Ufunguo asked Bitcoin Core for new blocks and mempool transactions, then BDK matched transaction outputs against your wallet descriptors.',

  afterSend:
    'Ufunguo selected UTXOs, created a recipient output and a change output, built a PSBT, signed the owned inputs locally and sent the finalized transaction to Bitcoin Core.',

  freshAddress:
    'Using a new address for every payment makes it harder for observers to link your payments together. All of these addresses belong to the same wallet.',

  fees: 'Miners prioritise transactions that pay more satoshis per virtual byte (sat/vB). The absolute fee is fee rate × transaction size. Regtest has no real fee market, so Ufunguo falls back to 2 sat/vB when Bitcoin Core has no estimate.',

  change:
    'A UTXO must be spent in full. Whatever is left after paying the recipient and the miner comes back to you as a new output on your internal (change) keychain.',

  psbt: 'A PSBT (Partially Signed Bitcoin Transaction, BIP174) is an unsigned transaction plus the information a signer needs: the coins being spent and their derivation paths. It can be inspected before anything is signed.',

  signing:
    'Signing proves you control the coins being spent. Rust re-derives your keys from the recovery phrase, signs each owned input, finalizes the witness data and then discards the keys.',

  mempool:
    'Once broadcast, the transaction waits in Bitcoin Core’s mempool. It is valid but not yet in a block, so it has 0 confirmations.',

  confirmations:
    'Each block mined on top of the one containing your transaction adds a confirmation. More confirmations make reversal increasingly unlikely. On regtest you mine blocks yourself in Polar.',

  derivation:
    'BIP84 paths read m / purpose’ / coin’ / account’ / chain / index. 84’ means native SegWit, 1’ means a test network, chain 0 is receive and chain 1 is change.',

  walletState:
    'The SQLite file stores public descriptors, revealed indices, the last synchronized block and transactions BDK found. Delete it and you can rebuild everything from the recovery phrase plus a rescan.',

  multiWallet:
    'Each wallet is a separate SQLite file with its own recovery phrase. This is a convenience for demos on one machine, not user accounts.',
} as const;
