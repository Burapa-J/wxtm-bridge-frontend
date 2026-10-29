import { ethers } from 'ethers'
import { microXtmToXtm, parseWxtmTokenAmount } from '@/utils/parse-wxtm-token-amount'
import {
  OotleTokensUnwrappedService,
  TokensUnwrappedService,
  UserTransactionDTO,
} from '@tari-project/wxtm-bridge-backend-api'
import { WXTM__factory, WXTMBridge__factory } from '@tari-project/wxtm-bridge-contracts/typechain/factories/contracts'
import { useConfig, useConnection, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import i18next from 'i18next'
import { setLastOngoingBridgeTx } from '@/store/account'
import { setBridgeError, setExceededDailyLimit } from '@/store/bridge'
import useAppStore from '@/store/app'
import { AssetConfig, amountAfterFee as getAmountAfterFee } from '@/utils/bridge-route'
import { isOotleAddress } from '@/utils/ootle-address'

// wTARI and wTARIBridge expose the same eip712Domain and bridgeToTariWithAuthorization as wXTM and wXTMBridge.
const tokenAbi = WXTM__factory.abi
const bridgeAbi = WXTMBridge__factory.abi

export const useBridgeToTari = (ethAddress: `0x${string}`, asset: AssetConfig) => {
  const { chainId, tokenAddress, bridgeAddress } = asset
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

    try {
      const limitMicro = await getRemainingDailyLimit()
      const limitXtm = microXtmToXtm(limitMicro)
      const amountNum = parseFloat(amount)

      if (limitXtm && amountNum > limitXtm) {
        setExceededDailyLimit(true)
        new Error(`[ TAPPLET-BRIDGE ] Daily limit exceeded. Limit: ${limitXtm}, Amount: ${amountNum}`)
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

      console.debug(`[ TAPPLET-BRIDGE ] Processing bridge to Tari...`)

      try {
        const txHash = await writeContract({
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

        console.debug(`[ TAPPLET-BRIDGE ] Bridge transaction executed with txHash: ${txHash}, amount: ${value}`)

        const amountAfterFee = getAmountAfterFee(value, asset.unwrapFeeBps)

        // set ongoing to immediately display wrap modal
        setLastOngoingBridgeTx({
          destinationAddress: tariAddress,
          tokenAmount: parseWxtmTokenAmount(amount),
          amountAfterFee: parseWxtmTokenAmount(ethers.utils.formatEther(amountAfterFee.toString())),
          status: UserTransactionDTO.status.PENDING,
          createdAt: new Date().toISOString(),
          paymentId: '',
          showModal: true,
          type: 'unwrap',
          ootleChainId: asset.kind === 'ootle' ? chainId : undefined,
        })

        return true
      } catch (e) {
        console.error(`[ TAPPLET-BRIDGE ] Error in bridge writeContract: ${e}`)
        return false
      }
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
