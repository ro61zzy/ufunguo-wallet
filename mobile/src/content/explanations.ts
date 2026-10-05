// Explain Mode copy.
// Plain-language explanations of what the Rust wallet actually does.

export const explain = {
  onboarding: [
    {
      key: 'non-custodial',
      title: 'Your keys, your bitcoin',
      body:
        'Ufunguo is designed as a non-custodial wallet: you control the recovery phrase used to authorize payments. “Ufunguo” means “key” in Swahili.',
    },
    {
      key: 'phrase',
      title: 'One secret creates the whole wallet',
      body:
        'Your 12-word recovery phrase represents a BIP39 secret. Rust uses it to derive the master key and every receive and change key used by the wallet.',
    },
    {
      key: 'utxo',
      title: 'Bitcoin is not an account balance',
      body:
        'A wallet tracks separate spendable outputs called UTXOs. Think of them like notes in a purse: your displayed balance is the total value of the outputs you can spend.',
    },
    {
      key: 'regtest',
      title: 'A safe Bitcoin laboratory',
      body:
        'This capstone runs on regtest, a private Bitcoin network created with Polar. Its coins have no real value, so you can create, send, mine and inspect transactions safely.',
    },
  ],

  afterCreate:
    'Rust generated 128 bits of secure randomness and encoded it as a 12-word BIP39 recovery phrase. From that phrase, it derived a BIP32 master key and created two BIP84 keychains: one for receiving bitcoin and another for change. The SQLite wallet stores the public descriptors and wallet state—not the recovery phrase.',

  afterRestore:
    'Rust checked every word against the BIP39 English word list and verified the phrase’s checksum. It then derived the same master key and rebuilt the same BIP84 wallet. This works because Bitcoin key derivation is deterministic: the same recovery phrase and network settings produce the same wallet.',

  afterReceive:
    'Rust revealed the next address from the external receive keychain. BDK advanced the derivation index and saved it in SQLite, preventing the wallet from repeatedly presenting the same address.',

  afterSync:
    'Rust connected to Bitcoin Core and requested blocks added since the wallet’s last known checkpoint, followed by current mempool transactions. BDK compared their scripts with scripts derived from the wallet descriptors and recorded any matches.',

  afterSend:
    'Rust synchronized the wallet, selected sufficient UTXOs and created recipient and change outputs. It packaged the transaction as a PSBT, signed the inputs controlled by this wallet, finalized it and asked Bitcoin Core to broadcast it.',

  freshAddress:
    'This address comes from the wallet’s external BIP84 keychain. Using a fresh address for each payment improves privacy by making separate payments harder to associate. The addresses still belong to the same recovery phrase.',

  fees:
    'Transaction fees are measured using satoshis per virtual byte (sat/vB). The final fee depends on both the selected fee rate and the transaction’s virtual size. Regtest has no active fee market, so Ufunguo uses a 2 sat/vB fallback when Bitcoin Core cannot provide an estimate.',

  change:
    'A UTXO cannot be partially spent. The transaction consumes it completely, pays the recipient, deducts the mining fee and returns the remainder to a new address from the wallet’s internal change keychain.',

  psbt:
    'A PSBT—Partially Signed Bitcoin Transaction—is a standard format defined by BIP174. It combines a transaction with the metadata signers need, allowing its inputs, outputs, amount, fee and change to be reviewed before broadcasting.',

  signing:
    'A digital signature proves that the wallet controls an input without revealing its private key. Rust derives the required signing keys from the recovery phrase, signs each wallet-owned input and adds the resulting witness data to the transaction.',

  mempool:
    'Bitcoin Core accepted the transaction and placed it in its mempool: the waiting area for valid transactions that have not entered a block. At this point it is unconfirmed and has zero confirmations.',

  confirmations:
    'The first confirmation arrives when a miner includes the transaction in a block. Every block added after it increases the confirmation count and makes reversing the payment progressively more difficult. On regtest, we mine these blocks ourselves using Polar.',

  derivation:
    'Ufunguo follows the BIP84 path m/84’/1’/0’/chain/index. The 84’ selects native SegWit, 1’ identifies a test network, chain 0 generates receive addresses and chain 1 generates change addresses.',

  walletState:
    'SQLite stores the wallet’s public descriptors, revealed address indices, blockchain checkpoint and discovered transactions. This allows Ufunguo to close and reopen without forgetting its state. The recovery phrase can rebuild the wallet, but it must rescan the chain to rediscover its transaction history.',

  multiWallet:
    'For this demonstration, each wallet is represented by a separate SQLite file with its own descriptors and recovery phrase. This lets us demonstrate payments between multiple independent wallets without pretending they are user accounts.',

  developmentBridge:
    'This mobile interface communicates with a Rust service running locally on the same development machine. It is a regtest-only bridge for demonstrating the Rust wallet core—not a production server. Never enter a real recovery phrase into this build.',
} as const;