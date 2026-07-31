# EigenLayer OETH nominal quote v6 design

## Scope

Extend the finalized covered-LST subset from 8/12 to 9/12 in exact order:
`stETH,rETH,cbETH,ETHx,oETH,osETH,swETH,lsETH,mETH`. OETH uses nominal
token-unit identity accounting only. It is not backing, ETH spot value,
immediate redemption, liquidity, or executable exit evidence.

## Immutable authority split

The official EigenLayer
[`v1.12.0` README at commit `d302f65042164c8d8d0a983c1540d85a8710030b`](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/README.md)
names strategy `0xa4C637e0F704745D182e4D38cAb7E7485321d059` as OETH. This is the
strategy-label authority.

Official OriginProtocol
[`origin-dollar` commit `07a7fcb052d715409014dd69e69e3c680ee8ae47`](https://github.com/OriginProtocol/origin-dollar/tree/07a7fcb052d715409014dd69e69e3c680ee8ae47)
is an immutable verified source snapshot, not a release or tag and ten commits
behind audit-time master. Its deployment artifacts pin OETH proxy
`0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3` and Vault proxy
`0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab`; its `addresses.js` pins WETH
`0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2`. This is address and selector
semantic authority only. Historical source does not prove live proxy
implementation/source correspondence.

## Quote and context contract

The OETH quote kind is `origin_oeth_vault_unit_identity_quote` and trust basis
is `origin_vault_nominal_withdrawal_unit_accounting`. Both quote wei fields must
exactly equal their observed OETH token amounts. OETH has no rate field;
`sweth_to_eth_rate_wei` remains swETH-only.

Append IDs 114--119 while preserving IDs 1--113 byte-for-byte in purpose:

| ID | Target | Selector | Decode and rule |
|---:|---|---|---|
| 114 | OETH proxy | `vaultAddress()` `0x430bf08a` | exact address; bind Vault proxy |
| 115 | Vault proxy | `oToken()` `0x1a32aad6` | exact address; bind OETH proxy |
| 116 | Vault proxy | `asset()` `0x38d52e0f` | exact address; bind WETH |
| 117 | Vault proxy | `lastRebase()` `0x78f353a1` | exact uint64; `<=` finalized timestamp; zero valid |
| 118 | Vault proxy | `rebasePaused()` `0x53ca9f24` | strict ABI bool 0 or 1; true valid |
| 119 | Vault proxy | `withdrawalClaimDelay()` `0x36f9a2fd` | exact uint256; zero valid and means async withdrawals disabled |

All calls use the same numeric finalized block tag. Cold batches are
`[2,5,48,36,28]`: 119 logical requests and 117 `eth_call`s. There is no
freshness cutoff. Do not call `totalValue`, queue metadata, `capitalPaused`, or
redemption endpoints.

Report context adds `oeth_last_rebase_unix`, `oeth_rebase_paused`, and
`oeth_withdrawal_claim_delay_seconds`. Methodology and cache are v6.

## Fail-closed boundary

Unquoted labels become `ankrETH,wBETH,sfrxETH`. Exactly two covered partial sums
remain non-null; all broader metrics, including executable withdrawal capacity,
remain null. Add four permanent gaps:
`oeth_rebase_freshness_not_verified`, `oeth_proxy_upgradeability_not_verified`,
`oeth_backing_not_reconciled`, and
`oeth_async_withdrawal_liquidity_not_verified`, for 26 total permanent gaps.
