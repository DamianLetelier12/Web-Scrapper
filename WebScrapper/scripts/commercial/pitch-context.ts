/**
 * DobProtocol pitch context for AI-generated applications and outreach.
 * Manually maintained - update traction numbers regularly.
 */

export const PITCH_CONTEXT = `
COMPANY: DobProtocol
WEBSITE: https://dobprotocol.com
APP: https://home.dobprotocol.com
TAGLINE: "On-chain Distribution Infrastructure" | Automated token distribution for DAOs, protocols, and tokenized businesses

PRODUCT:
- Platform for creating and managing on-chain distribution pools (rewards, payroll, treasury, airdrops)
- Smart contract infrastructure on Stellar (Soroban) and EVM chains (Base, Arbitrum, Lisk)
- Lazy pull-based distribution model (V2): O(1) gas cost regardless of number of shareholders
- Participation token system: each pool mints its own token representing shares
- Marketplace for buying/selling pool participation shares
- TRUFA device validation: trust scoring system that validates the device managing a pool
- DOB Validator: companion platform for device attestation and certificate management
- Multi-chain: Stellar mainnet, Base, Arbitrum, Lisk (+ testnets)

KEY VALUE PROPOSITIONS:
1. Scalable distributions: V2 lazy-pull model handles 10,000+ shareholders with O(1) gas per distribution (admin creates round, users claim individually)
2. Trust & transparency: TRUFA validation scores pool managers' devices, on-chain certificates, full audit trail
3. Multi-chain flexibility: Deploy pools on Stellar for low fees or EVM chains for DeFi composability
4. Tokenized participation: Pool shares are tradeable tokens with built-in marketplace
5. Automated scheduling: Time-gated distributions with configurable intervals, claim windows, and round expiry

PRODUCT FEATURES:
- Pool creation wizard (airdrop/buy access modes)
- Distribution scheduling with auto-trigger
- Share marketplace (buy/sell participation)
- TRUFA validation panel with score visualization
- Multi-token support per pool
- Join request system with conditions
- Project grouping for multiple pools
- Real-time event tracking from blockchain

STAGE: Early traction / seed stage
TEAM: Oscar Castillo (Founder/CEO), full-stack + blockchain engineer
LOCATION: Global, product live on mainnet

TRACTION:
- Live on Stellar mainnet + 3 EVM chains (Base, Arbitrum, Lisk)
- Active pools with real token distributions
- Smart contract V2 deployed with SEP-55 verification
- DOB Validator live at validator.dobprotocol.com
- Growing user base across multiple chains
- Testnet pools on 4 additional networks

TECH STACK:
- Smart Contracts: Rust/Soroban (Stellar), Solidity (EVM)
- Backend: Node.js, Express, Sequelize, PostgreSQL
- Frontend: Angular 15, Material UI
- Blockchain: @stellar/stellar-sdk 14, ethers.js 6
- Validation: DOB Validator (Next.js, device attestation)

BLOCKCHAIN NETWORKS:
- Stellar Mainnet (primary - low fees, fast finality)
- Base (L2 - DeFi ecosystem)
- Arbitrum (L2 - high throughput)
- Lisk (L2 - emerging ecosystem)

MARKET:
- DAO tooling and treasury management
- Token distribution infrastructure
- DeFi yield and reward systems
- Payroll for decentralized teams
- Competitors: Superfluid, Sablier, Splits.org
- Differentiator: Multi-chain + lazy distribution + TRUFA trust scoring + participation marketplace

ASK: Seed funding for team expansion, multi-chain deployment, and ecosystem partnerships
USE OF FUNDS: Engineering hires, chain integrations, security audits, BD/partnerships, marketing
`.trim()
