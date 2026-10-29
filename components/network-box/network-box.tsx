import React from 'react'
import Image from 'next/image'
import { IoIosArrowUp, IoIosArrowDown } from 'react-icons/io'

import { NetworkBoxProps } from './network-box.types'

export const NetworkBox = ({ type, selected, isOpen, networks, onToggle, onSelect }: NetworkBoxProps) => {
  const getFilteredNetworks = () => {
    return networks.filter((network) => network.name !== selected.name)
  }

  const tokenSymbol = selected.token
  const filteredNetworks = getFilteredNetworks()

  return (
    <div className="relative">
      <div className="flex items-center gap-3 p-2 px-4 bg-white rounded-xl border border-gray-200 min-h-[90px] max-h-[90px]">
        <div className="w-[38px] h-[38px] relative rounded-full overflow-hidden ml-3">
          <Image src={selected.icon} fill alt={selected.name} sizes="38px" className="object-cover rounded-full" />
        </div>
        <div className="flex flex-col text-xs text-gray-500 font-medium">
          <div>{type === 'from' ? 'From' : 'To'}</div>
          <div className="text-xl font-bold text-[#171717] -my-1">{tokenSymbol}</div>
          <div>{selected.name}</div>
        </div>

        <div className="ml-auto cursor-pointer mr-2" onClick={onToggle}>
          {isOpen ? <IoIosArrowUp className="text-xl" /> : <IoIosArrowDown className="text-xl" />}
        </div>
      </div>

      {isOpen && (
        <div className="absolute bottom-full left-0 mt-2 mb-1.5 w-full z-50 bg-white rounded-xl shadow-lg p-3 space-y-2">
          {filteredNetworks.map((network) => (
            <div
              key={network.name}
              className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 cursor-pointer"
              onClick={() => onSelect(network)}
            >
              <div className="w-6 h-6 relative">
                <Image src={network.icon} fill alt={network.name} sizes="24px" className="object-cover rounded-full" />
              </div>
              <span className="text-sm font-medium text-gray-800">{network.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
