import { describe, expect, it } from 'vitest'
import { mainnet, sepolia } from 'viem/chains'
import { wTARIAbi, wTARIBridgeAbi, wXTMAbi, wXTMBridgeAbi } from './abis'
import { DEPLOYMENTS_SOURCE, getDeployments } from './deployments'

type Abi = readonly { type: string; name?: string }[]
const fragment = (abi: Abi, name: string) => abi.find((f) => f.type === 'function' && f.name === name)

describe('vendored contracts', () => {
  it('records the contracts commit it was synced from', () => {
    expect(DEPLOYMENTS_SOURCE).toMatch(/^tari-project\/wxtm-bridge-contracts@[0-9a-f]{40}$/)
  })

  // use-bridge-to-tari.ts calls these on both token/bridge pairs with the same arguments.
  it.each([
    ['eip712Domain', wXTMAbi, wTARIAbi],
    ['bridgeToTariWithAuthorization', wXTMBridgeAbi, wTARIBridgeAbi],
  ] as const)('%s has the same signature on wXTM and wTARI', (name, wxtm, wtari) => {
    expect(fragment(wxtm, name)).toBeDefined()
    expect(fragment(wtari, name)).toEqual(fragment(wxtm, name))
  })

  it('wTARIBridge ABI carries the target-address revert', () => {
    expect(wTARIBridgeAbi.some((f) => f.type === 'error' && f.name === 'InvalidTargetTariAddress')).toBe(true)
  })

  it('keeps the published wXTM addresses', () => {
    expect(getDeployments(mainnet.id)).toMatchObject({
      wXTM: '0xfD36fA88bb3feA8D1264fc89d70723b6a2B56958',
      wXTMBridge: '0x810be828EFA687667B289C488A57a7B48Fb4523E',
    })
    expect(getDeployments(sepolia.id).wXTMBridge).toBe('0x4F31d7FC63FdBcfC119F9A0C0549150B00C356e8')
  })

  it('returns no addresses for an unknown chain', () => {
    expect(getDeployments(999999)).toEqual({
      wXTM: undefined,
      wXTMBridge: undefined,
      wXTMController: undefined,
      wTARI: undefined,
      wTARIController: undefined,
      wTARIBridge: undefined,
      wTARIBridgeStartBlock: undefined,
    })
  })
})
