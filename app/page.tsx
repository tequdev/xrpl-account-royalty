'use client'
import { Client, NFTokenAcceptOffer, TransactionMetadata, dropsToXrp, isValidAddress, parseNFTokenID } from 'xrpl'
import BigNumber from 'bignumber.js'
import { useMemo, useRef, useState } from 'react'

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
  ).map((tx) => ({
    node: (tx.meta as TransactionMetadata).AffectedNodes.find((node, _, otherNodes) => {
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
    }),
    NFTokenID: (tx.meta as TransactionMetadata<NFTokenAcceptOffer>).nftoken_id
  })).filter((node) => !!node.node)

  console.log(ModifiedNode)
  const xrplist = ModifiedNode.map((node) => {
    if (node.node && 'ModifiedNode' in node.node) {
      const finalBalance = node.node.ModifiedNode.FinalFields?.Balance
      const previousBalance = node.node.ModifiedNode.PreviousFields?.Balance
      return {
        taxon: parseNFTokenID(node.NFTokenID!).Taxon,
        amount: dropsToXrp(BigNumber(finalBalance as number).minus(previousBalance as number).toNumber())
      }
    }
    throw new Error('error')
  })

  if (xrplist.length === 0) return {}

  const sum = xrplist.reduce((prev, current) => {
    const prevValue = prev[String(current.taxon)] || 0
    return { ...prev, [current.taxon]: BigNumber(prevValue).plus(current.amount).toString() }
  }, {} as { [key: string]: string })

  await client.disconnect()
  return sum
}

export default function Home() {
  const [royalty, setRoyalty] = useState<{ [key in string]: string }>({})
  const addressRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const fetcher = async () => {
    setLoading(true)
    setRoyalty({})
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

  const royaltySum = useMemo(() => Object.values(royalty).reduce((prev, current) => BigNumber(prev).plus(current).toString(), '0'), [royalty])

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 max-w-5xl w-full text-3xl items-center justify-center font-mono lg:flex">
        XRP Ledger Royalty Checker
      </div>
      {/* rnrJP7G4pPLKS5VQhVRmXKYkK2SEY2pC2X */}
      <div className='input-group justify-center my-16'>
        <input ref={addressRef} type="text" className='input w-[300px]' placeholder='rAbc...' />
        <button className='btn btn-primary w-[70px]' onClick={fetcher} disabled={loading}>
          {!loading ? 'Go' : <span className="loading loading-spinner loading-xs" />}
        </button>
      </div>

      {Object.keys(royalty).length > 0 &&
        <div className='text-center'>
          <div>Total royalties you have received:</div>
          <span className='text-2xl'>{royaltySum} XRP</span>

          <div className='mt-4'>
            <span className='text-xl'>Breakdown:</span>
            <div className='text-left px-2'>
              {Object.entries(royalty).map(([key, value]) => (
                <div key={key} className='flex justify-between'>Taxon {key}: <span>{parseFloat(value).toFixed(6)} XRP</span></div>
              ))}
            </div>
          </div>
        </div>
      }
    </main>
  )
}
