# NFT Sale contract with jetton support
This contract allows to sell NFT for jettons or TONs. You can specify any number of jettons you want. Also, you can disable selling by TONs setting zero price. **Contract can be renamed to nft-fixprice-sale-v4.**

## Behaviour
Contract behaves like `nft-fixprice-sale-v3`, but with implemented jetton transfer handler and with jetton prices dictionary at the end state, after `can_deploy_by_external`.
Dictionary contains sale jetton wallet address hashes as a key, and NFT prices as a value, serialized as:
```
jetton_prices#_ full_price:Coins marketplace_fee:Coins royalty_amount:Coins; 
```
### Jettons handling
Contract will try to return it back, forwarding the rest of gas to sender, if: 
- the user sends unknown jetton
- the user tries to send any jetton after completion
- the user sends amount lower than `full_price`
- the user forwards TONs lower than `min_gas_amount`
- the contract is not initialized

Contract will return the rest of jetton amount if it is larger than `full_price`.
