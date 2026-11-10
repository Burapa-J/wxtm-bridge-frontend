'use client'

import React from 'react'
import { getDeployments } from '@/contracts/deployments'
// import { WXTM__factory } from '@tari-project/wxtm-bridge-contracts/typechain/factories/contracts'
// import { writeContract } from '@wagmi/core'
// import { getConfig } from '@/utils/config'

/** @dev Example function usage */
const Bridge = () => {
  // const [config] = useState(() => getConfig())

  const deployments = getDeployments(11155111)
  const wXTM = deployments.wXTM
  const wXTMBridge = deployments.wXTMBridge

  /** @dev Getting ABI */
  // const abi = WXTM__factory.abi
  // console.log('ABI: ', abi)

  // const handleContractFunction = async () => {
  //   const result = await writeContract(config, {
  //     abi,
  //     address: wXTM,
  //     functionName: 'mint',
  //     args: ['0xd2135CfB216b74109775236E36d4b433F1DF507B', BigInt(666)],
  //   })
  // }

  return (
    <section>
      <div className="flex flex-col">
        <div>wXTM Address: {wXTM}</div>
        <div>wXTMBridge: {wXTMBridge}</div>
      </div>
      bridge
    </section>
  )
}

export default Bridge
