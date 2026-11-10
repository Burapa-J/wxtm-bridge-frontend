import { ethers } from 'ethers'
import { isOverDailyLimit } from '@/utils/parse-wxtm-token-amount'
import {
  OotleTokensUnwrappedService,
  TokensUnwrappedService,
  UserUnwrappedTransactionDTO,
} from '@tari-project/wxtm-bridge-backend-api'
import { wTARIAbi, wTARIBridgeAbi, wXTMAbi, wXTMBridgeAbi } from '@/contracts/abis'
import { useConfig, useConnection, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import i18next from 'i18next'
import { refreshOotleRegistry, setLastOngoingBridgeTx } from '@/store/account'
import { setBridgeError, setExceededDailyLimit } from '@/store/bridge'
import useAppStore from '@/store/app'
import {
  AssetConfig,
  amountAfterFee as getAmountAfterFee,
  getOotleUnwrapRefusal,
} from '@/utils/bridge-route'
import { isOotleAddress } from '@/utils/ootle-address'

export const useBridgeToTari = (ethAddress: `0x${string}`, asset: AssetConfig) => {
  const { chainId, tokenAddress, bridgeAddress } = asset
  // eip712Domain and bridgeToTariWithAuthorization are identical across the pairs (contracts/abis.test.ts);
  // the wTARI ABIs also decode wTARIBridge-only errors such as InvalidTargetTariAddress.
  const tokenAbi = asset.kind === 'ootle' ? wTARIAbi : wXTMAbi
  const bridgeAbi = asset.kind === 'ootle' ? wTARIBridgeAbi : wXTMBridgeAbi
  const wagmiConfig = useConfig()
  const { chainId: connectedChainId } = useConnection()
  const { switchChainAsync } = useSwitchChain()
  const { data: domainData } = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: 'eip712Domain',
    args: [],
    chainId,
  })
  const { mutateAsync: writeContract, isPending, isSuccess, isError, error } = useWriteContract()

  const generateAuthorizationSignature = async (
    from: `0x${string}`,
    to: string,
    value: bigint,
    validAfter: bigint,
    validBefore: bigint,
    nonce: string,
  ) => {
    const signer = await getWalletClient(wagmiConfig, { account: from, chainId })

    if (!domainData) {
      console.error(`[ TAPPLET-BRIDGE ] Domain data not available`)
      throw new Error('Domain data not available')
    }

    const domain = {
      name: domainData[1],
      version: domainData[2],
      chainId,
      verifyingContract: tokenAddress,
    }
    const types = {
      ReceiveWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    }
    const message = {
      from,
      to,
      value: value,
      validAfter,
      validBefore,
      nonce,
    }

    const signature = await signer.signTypedData({
      domain,
      types,
      primaryType: 'ReceiveWithAuthorization',
      message,
    })
    const { v, r, s } = ethers.utils.splitSignature(signature)

    return { v, r, s }
  }

  const getRemainingDailyLimit = () =>
    asset.kind === 'ootle'
      ? OotleTokensUnwrappedService.getOotleRemainingDailyLimit(chainId)
      : TokensUnwrappedService.getRemainingDailyLimit()

  const bridgeToTari = async (amount: string, ethAddress: `0x${string}`, tariAddress: string) => {
    const t = i18next.getFixedT(null, 'main')

    if (asset.kind === 'ootle' && !isOotleAddress(tariAddress, useAppStore.getState().network)) {
      console.error(`[ TAPPLET-BRIDGE ] Invalid Ootle destination address`)
      setBridgeError(t('invalid_ootle_address'))
      return false
    }

    // set again below if this unwrap is over the limit; callers read it when this returns false
    setExceededDailyLimit(false)
    try {
      const limitMicro = await getRemainingDailyLimit()

      // Stop before the chain switch and signing; the daily-limit banner tells the user why.
      if (isOverDailyLimit(amount, limitMicro)) {
        console.warn(`[ TAPPLET-BRIDGE ] Daily limit exceeded. Limit: ${limitMicro} micro, Amount: ${amount}`)
        setExceededDailyLimit(true)
        return false
      }

      if (connectedChainId !== chainId) {
        try {
          await switchChainAsync({ chainId })
        } catch (e) {
          console.error(`[ TAPPLET-BRIDGE ] Wallet did not switch to chain ${chainId}: ${e}`)
          setBridgeError(t('switch_chain_error', { chain: asset.chainName }))
          return false
        }
      }

      const value = BigInt(ethers.utils.parseEther(amount).toString())

      const now = Math.floor(Date.now() / 1000)
      const validAfter = BigInt(now)
      const validBefore = BigInt(now + 3600) // 1 hour

      const authNonce = ethers.utils.hexlify(ethers.utils.randomBytes(32))

      const { v, r, s } = await generateAuthorizationSignature(
        ethAddress,
        bridgeAddress,
        value,
        validAfter,
        validBefore,
        authNonce,
      )

      // The registry can change while the tapplet is open (e.g. the chain is disabled); recheck it right
      // before the irreversible burn rather than trusting the list loaded at startup.
      if (asset.kind === 'ootle') {
        const refusal = getOotleUnwrapRefusal(asset, await refreshOotleRegistry())
        if (refusal) {
          console.error(`[ TAPPLET-BRIDGE ] Not burning on chain ${chainId}: ${refusal}`)
          setBridgeError(t(refusal, { token: asset.evmToken, chain: asset.chainName }))
          return false
        }
      }

      console.debug(`[ TAPPLET-BRIDGE ] Processing bridge to Tari...`)

      let txHash
      try {
        txHash = await writeContract({
          address: bridgeAddress,
          abi: bridgeAbi,
          functionName: 'bridgeToTariWithAuthorization',
          args: [
            tariAddress,
            value,
            BigInt(validAfter),
            BigInt(validBefore),
            authNonce as `0x${string}`, // bytes32
            v,
            r as `0x${string}`,
            s as `0x${string}`,
          ],
          chainId,
        })
      } catch (e) {
        console.error(`[ TAPPLET-BRIDGE ] Error in bridge writeContract: ${e}`)
        return false
      }

      // The burn is submitted; nothing below may report it as failed.
      try {
        console.debug(`[ TAPPLET-BRIDGE ] Bridge transaction executed with txHash: ${txHash}, amount: ${value}`)

        // set ongoing to immediately display wrap modal
        // An unwrap record, in the EVM token's 18-decimal units like the backend's unwrap rows.
        setLastOngoingBridgeTx({
          destinationAddress: tariAddress,
          amount: value.toString(),
          amountAfterFee: getAmountAfterFee(value, asset.unwrapFeeBps).toString(),
          status: UserUnwrappedTransactionDTO.status.PENDING,
          createdAt: new Date().toISOString(),
          transactionHash: txHash ?? '',
          blockTimestamp: '',
          paymentId: '',
          showModal: true,
          type: 'unwrap',
          ootleChainId: asset.kind === 'ootle' ? chainId : undefined,
        })
      } catch (e) {
        console.error(`[ TAPPLET-BRIDGE ] Error recording the submitted unwrap: ${e}`)
      }
      return true
    } catch (err) {
      console.error(`[ TAPPLET-BRIDGE ] Error in bridge process: ${err}`)
      return false
    }
  }

  return {
    bridgeToTari,
    isPending,
    isSuccess,
    isError,
    error,
  }
}
