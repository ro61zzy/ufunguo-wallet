# Ufunguo architecture

## Design goal

Ufunguo separates Bitcoin wallet behavior from presentation. `ufunguo-core` owns wallet rules and can later power a CLI, a mobile bridge or another interface without duplicating key derivation and transaction logic.

```mermaid
flowchart LR
    subgraph Interfaces
        CLI["Rust CLI"]
        Mobile["React Native — planned"]
    end

    subgraph Wallet
        Core["ufunguo-core"]
        BDK["BDK"]
        Store[("SQLite")]
    end

    subgraph Bitcoin
        Node["Bitcoin Core RPC"]
        Chain["Regtest chain + mempool"]
    end

    CLI --> Core
    Mobile -. "future bridge" .-> Core
    Core --> BDK
    BDK <--> Store
    Core <--> Node
    Node <--> Chain
```

## Key lifecycle

```mermaid
flowchart TD
    Words["12-word BIP39 mnemonic"] --> Seed["BIP39 seed"]
    Seed --> Master["BIP32 master extended private key"]
    Master --> Receive["BIP84 receive keychain /0/*"]
    Master --> Change["BIP84 change keychain /1/*"]
    Receive --> Address["Native SegWit address"]
    Change --> ChangeAddress["Internal change address"]
```

On regtest, Ufunguo uses coin type `1'`:

- Receive: `m/84'/1'/0'/0/*`
- Change: `m/84'/1'/0'/1/*`

The mnemonic deterministically recreates the same master key, descriptors and addresses. SQLite stores revealed indices, chain state, transactions and UTXOs; it is not the source of the wallet's identity.

## Receive lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant W as Ufunguo
    participant N as Bitcoin Core
    participant D as SQLite

    U->>W: Request fresh address
    W->>W: Reveal next external index
    W->>D: Persist revealed index
    N-->>W: Mempool transaction / block
    W->>W: Match output script to descriptor
    W->>D: Persist transaction and UTXO
    W-->>U: Used address, balance and history
```

## Send lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant W as Ufunguo
    participant N as Bitcoin Core

    U->>W: Destination + amount
    W->>N: Sync and request fee estimate
    W->>W: Select UTXOs
    W->>W: Create recipient + change outputs
    W-->>U: Review amount, fee, inputs and outputs
    U->>W: Confirm + enter mnemonic
    W->>W: Build, sign and finalize PSBT
    W->>N: Broadcast signed transaction
    W->>N: Poll blocks and mempool
    W-->>U: Unconfirmed → confirmed
```

Bitcoin Core never signs the transaction. Ufunguo constructs and signs locally, then sends only the finalized transaction to the node.

## Crate responsibilities

| Component | Responsibility |
|---|---|
| `bitcoin` | Addresses, amounts, transactions, PSBTs and network types |
| `bip39` | Mnemonic generation and validation |
| `bdk_wallet` | Descriptors, address derivation, chain state, UTXOs, coin selection and PSBT construction |
| BDK SQLite persistence | Durable wallet state between commands |
| `bdk_bitcoind_rpc` / `bitcoincore-rpc` | Block/mempool synchronization, fee estimation and broadcasting |
| `clap` | CLI command parsing |
| `zeroize` | Clears temporary recovery-phrase strings after parsing |

## Multiple wallets

Each database path represents one independent wallet:

```text
wallets/alice.sqlite      mnemonic A + descriptors A + state A
wallets/bob.sqlite        mnemonic B + descriptors B + state B
wallets/presentation.sqlite
```

This supports one operator managing several wallets locally. It deliberately does not claim to provide user accounts, authorization or encrypted multi-tenant storage.
