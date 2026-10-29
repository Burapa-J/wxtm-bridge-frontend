import { BackendBridgeTransaction } from '@/types/transactions'
import {
  TariL1SignerParameters,
  SignerMethodNames,
  SignerRequest,
  SignerResponse,
  SignerReturnType,
  AccountData,
  WalletBalance,
} from '../types/tapplet'

export interface SendOneSidedRequest {
  amount: string
  address: string
  paymentId?: string
}

export interface BaseNodeStatus {
  sha_network_hashrate: number
  monero_randomx_network_hashrate: number
  tari_randomx_network_hashrate: number
  block_reward: number
  block_height: number
  block_time: number
  is_synced: boolean
  num_connections: number
  readiness_status: string
}

export interface BridgeTxDetails {
  amount: string
  amountToReceive: string
  destinationAddress: string
  paymentId: string
  // Set for Ootle wraps so a reload can finish the tokens-sent step. clientToken is a secret.
  network?: 'Ootle'
  chainId?: number
  clientToken?: string
  ootleTransactionId?: string
}

export interface BridgeEnvs {
  walletconnect_id: string
  backend_api: string
}

export class TariL1Signer {
  public signerName = 'TariL1Signer'

  public constructor(public params: TariL1SignerParameters) {
    const filterResizeEvent = function (event: MessageEvent) {
      if (event.data && event.data.type === 'resize') {
        const resizeEvent = new CustomEvent('resize', {
          detail: { width: event.data.width, height: event.data.height },
        })
        window.dispatchEvent(resizeEvent)
      }
    }
    window.addEventListener(
      'message',
      (event) => filterResizeEvent(event),
      false,
    )
  }

  private async sendRequest<MethodName extends SignerMethodNames>(
    req: Omit<SignerRequest<MethodName>, 'id'>,
  ): Promise<SignerReturnType<MethodName>> {
    const timeoutMs = req.methodName === 'sendOneSided' ? SIGNER_SEND_TIMEOUT_MS : undefined
    return sendSignerCall(req.methodName, req.args, timeoutMs) as Promise<SignerReturnType<MethodName>>
  }

  /**
   * @description check if Tari Signer is connected with the Tari Universe
   * @returns true or false
   */
  public async isConnected(): Promise<boolean> {
    return this.sendRequest({
      methodName: 'isConnected',
      args: [],
    })
  }

  /**
   * @description get Tari Account details
   * @returns account data
   */
  public async getAccount(): Promise<AccountData> {
    const resp = await this.sendRequest({
      methodName: 'getAccount',
      args: [],
    })

    return {
      account_id: resp?.account_id ?? 0,
      address: resp?.address ?? '',
    }
  }

  /**
   * @description send XTM via one-sided transaction
   * @param amount XTM amount (uT or T)
   * @param address Tari Address one-sided
   * @param paymentId (optional) payment-id
   * @returns true if tx success; otherwise false
   */
  public async sendOneSided({
    amount,
    address,
    paymentId,
  }: SendOneSidedRequest): Promise<boolean> {
    return this.sendRequest({
      methodName: 'sendOneSided',
      args: [{ amount, address, paymentId }],
    })
  }

  /**
   * @description get Base Node status
   * @returns BaseNodeStatus
   */
  public async getBaseNodeStatus(): Promise<BaseNodeStatus> {
    return this.sendRequest({
      methodName: 'getBaseNodeStatus',
      args: [],
    })
  }

  /**
   * @description get Tari Account balance
   * @returns XTM amount
   */
  public async getTariBalance(): Promise<WalletBalance> {
    return this.sendRequest({
      methodName: 'getTariBalance',
      args: [],
    })
  }

  /**
   * @description add to TU store pending transaction
   * @returns true or false
   */
  public async setOngoingBridgeTx(tx: BridgeTxDetails): Promise<boolean> {
    return this.sendRequest({
      methodName: 'setOngoingBridgeTx',
      args: [tx],
    })
  }

  /**
   * @description check if there is any pending transaction
   * @returns true or false
   */
  public async getOngoingBridgeTx(): Promise<BridgeTxDetails | undefined> {
    return this.sendRequest({
      methodName: 'getOngoingBridgeTx',
      args: [],
    })
  }

  /**
   * @description check if there is any pending transaction
   * @returns true or false
   */
  public async removeOngoingBridgeTx(): Promise<boolean> {
    return this.sendRequest({
      methodName: 'removeOngoingBridgeTx',
      args: [],
    })
  }

  /**
   * @description get Tari Universe language
   * @returns app language
   */
  public async getAppLanguage(): Promise<string | undefined> {
    return this.sendRequest({
      methodName: 'getAppLanguage',
      args: [],
    })
  }

  /**
   * @description get bridge envs for different environments
   * @returns bridge envs
   */
  public async getBridgeEnvs(): Promise<[string, string] | undefined> {
    return this.sendRequest({
      methodName: 'getBridgeEnvs',
      args: [],
    })
  }

  /**
   * @description get Tari Account bridge transactions from backend
   * @returns Bridge transactions
   */
  public async getBackendBridgeTxs(): Promise<BackendBridgeTransaction[]> {
    return this.sendRequest({
      methodName: 'getBackendBridgeTxs',
      args: [],
    })
  }

  public async getNetwork(): Promise<string | undefined> {
    return this.sendRequest({
      methodName: 'getNetwork',
      args: [],
    })
  }
}

// Every signer client shares this one postMessage channel. Ids are random so another frame can't guess
// them, and only replies from Universe (the parent window) are accepted.
const SIGNER_CALL_TIMEOUT_MS = 60_000
// Sends wait for the user to enter their PIN in Universe.
export const SIGNER_SEND_TIMEOUT_MS = 10 * 60_000

export function sendSignerCall(
  methodName: string,
  args: unknown[],
  timeoutMs = SIGNER_CALL_TIMEOUT_MS,
): Promise<unknown> {
  const id = crypto.randomUUID()
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', event_ref)
      reject(new Error(`Signer call ${methodName} timed out`))
    }, timeoutMs)

    const event_ref = (resp: MessageEvent<SignerResponse<SignerMethodNames>>) => {
      if (resp.source !== window.parent) return
      if (!resp.data || resp.data.id !== id || resp.data.type !== 'signer-call') return
      clearTimeout(timer)
      window.removeEventListener('message', event_ref)
      if (resp.data.resultError) {
        reject(resp.data.resultError)
      } else {
        resolve(resp.data.result)
      }
    }

    window.addEventListener('message', event_ref, false)

    window.parent.postMessage({ methodName, args, id, type: 'signer-call' }, '*')
  })
}

export default TariL1Signer
