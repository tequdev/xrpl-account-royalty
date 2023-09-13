'use client'
import { Client, TransactionMetadata, dropsToXrp, isValidAddress } from 'xrpl'
import BigNumber from 'bignumber.js'
import { useRef, useState } from 'react'

const getRoyalty = async (account: string) => {
  const client = new Client('wss://xrpl.ws')
  await client.connect()

  const response = await client.requestAll({
    command: 'account_tx',
    account,
    ledger_index_min: 75443457
  })

  const ModifiedNode = response.flatMap((r) =>
    r.result.transactions.filter((tx) => {
      return (tx.meta as any).TransactionResult === 'tesSUCCESS' && tx.tx?.Account !== account && tx.tx?.TransactionType === 'NFTokenAcceptOffer'
    })
  ).map((tx) => (tx.meta as TransactionMetadata).AffectedNodes.find((node,_,otherNodes) => {
    if (!(node && 'ModifiedNode' in node)) {
      return false
    }
    const isAccountRoot = node.ModifiedNode?.LedgerEntryType === 'AccountRoot'
    const isUserAccount = node.ModifiedNode?.FinalFields?.Account === account
    // check if this transaction affected the account's own XRP balance
    const hasBalanceChanged = !!node.ModifiedNode.PreviousFields?.Balance
    // check if this transaction affected the account's own NFToken to the offer
    const hasDirectryNodeChanged = otherNodes.some((node) => {
      if ('DeletedNode' in node) return 'DeletedNode' in node && node.DeletedNode.LedgerEntryType === 'DirectoryNode' && node.DeletedNode.FinalFields.Owner === account
      if ('ModifiedNode' in node) return 'ModifiedNode' in node && node.ModifiedNode.LedgerEntryType === 'DirectoryNode' && node.ModifiedNode.FinalFields?.Owner === account
      if ('CreatedNode' in node) return 'CreatedNode' in node && node.CreatedNode.LedgerEntryType === 'DirectoryNode' && node.CreatedNode.NewFields?.Owner === account
      return false
    })
    return isAccountRoot && isUserAccount && hasBalanceChanged && !hasDirectryNodeChanged
  })).filter((node)=> !!node)

  console.log(ModifiedNode)
  const xrplist = ModifiedNode.map((node) => {
    if (node && 'ModifiedNode' in node ) {
      return dropsToXrp(BigNumber(node.ModifiedNode.FinalFields?.Balance as number).minus(node.ModifiedNode.PreviousFields?.Balance as number).toNumber())
    }
    throw new Error('error')
  })
  
  if(xrplist.length === 0) return '0'

  const sum = xrplist.reduce((prev, current) => {
    return BigNumber(prev).plus(current).toString()
  })

  await client.disconnect()
  return sum
}

export default function Home() {
  const [royalty, setRoyalty] = useState<string>('')
  const addressRef = useRef<HTMLInputElement>(null)
  const [loading,setLoading] = useState<boolean>(false)

  const fetcher = async () => {
    setLoading(true)
    setRoyalty('')
    try {
      
      const address = addressRef.current?.value
      if (address === undefined || !isValidAddress(address)) {
        alert('Invalid address')
        setLoading(false)
        return
      }
      const xrp = await getRoyalty(address)
      setRoyalty(xrp)
    } catch (e) {
      console.error(e)
      alert('Error')
    } finally {
      setLoading(false)      
    }
  }
  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 max-w-5xl w-full text-3xl items-center justify-center font-mono lg:flex">
        XRP Ledger Royalty Checker
      </div>
      {/* rnrJP7G4pPLKS5VQhVRmXKYkK2SEY2pC2X */}
      <div className='input-group justify-center my-16'>
        <input ref={addressRef} type="text" className='input w-[300px]' placeholder='rAbc...' />
        <button className='btn btn-primary w-[70px]' onClick={fetcher} disabled={loading}>
          {!loading ? 'Go': <span className="loading loading-spinner loading-xs"/>}
        </button>
      </div>

      {royalty &&
        <div className='text-center'>
          <div>Total royalties you have received:</div>
          <span className='text-2xl'>{royalty} XRP</span>
        </div>
      }
    </main>
  )
}
