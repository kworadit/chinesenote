import { useState, useEffect } from 'react'
import './App.css'

interface Card {
  id: string
  headword_sc: string
  headword_tc: string
  pinyin: string
  defn: string
  remark: string
  filename?: string
  date?: string
}

interface XMLFile {
  filename: string
  date: string
}

const API_BASE = 'http://localhost:8000'

function App() {
  const [files, setFiles] = useState<XMLFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [cards, setCards] = useState<Card[]>([])
  const [search, setSearch] = useState({ sc: '', pinyin: '', defn: '', remark: '' })
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCard, setNewCard] = useState({ headword_sc: '', headword_tc: '', pinyin: '', defn: '' })

  useEffect(() => {
    fetchFiles()
  }, [])

  const fetchFiles = async () => {
    try {
      const response = await fetch(`${API_BASE}/files`)
      const data = await response.json()
      setFiles(data)
      if (data.length > 0 && !selectedFile) {
        setSelectedFile(data[0].filename)
        fetchCards(data[0].filename)
      }
    } catch (error) {
      console.error('Error fetching files:', error)
    }
  }

  const fetchCards = async (filename: string) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/cards/${filename}`)
      const data = await response.json()
      setCards(data)
    } catch (error) {
      console.error('Error fetching cards:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const { sc, pinyin, defn, remark } = search
    if (!sc.trim() && !pinyin.trim() && !defn.trim() && !remark.trim()) {
      if (selectedFile) fetchCards(selectedFile)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (sc) params.append('sc', sc)
      if (pinyin) params.append('pinyin', pinyin)
      if (defn) params.append('defn', defn)
      if (remark) params.append('remark', remark)
      
      const response = await fetch(`${API_BASE}/search?${params.toString()}`)
      if (!response.ok) throw new Error('Search failed')
      const data = await response.json()
      setCards(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error searching cards:', error)
      alert('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const updateRemark = async (cardId: string, filename: string, remark: string) => {
    try {
      await fetch(`${API_BASE}/cards/${filename}/${cardId}/remark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark })
      })
      // Local update
      setCards(cards.map(c => c.id === cardId ? { ...c, remark } : c))
    } catch (error) {
      console.error('Error updating remark:', error)
    }
  }

  const handleAddCard = async (e?: React.FormEvent, force: boolean = false) => {
    if (e) e.preventDefault()
    if (!selectedFile) return
    try {
      const response = await fetch(`${API_BASE}/cards/${selectedFile}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCard, force })
      })
      
      if (response.status === 409) {
        const errorData = await response.json()
        if (window.confirm(`${errorData.detail}. Do you still want to add it?`)) {
          handleAddCard(undefined, true)
        }
        return
      }

      if (!response.ok) throw new Error('Add failed')
      
      setShowAddForm(false)
      setNewCard({ headword_sc: '', headword_tc: '', pinyin: '', defn: '' })
      fetchCards(selectedFile)
    } catch (error) {
      console.error('Error adding card:', error)
      alert('Failed to add card.')
    }
  }

  const handleDeleteCard = async (cardId: string, filename: string) => {
    if (!window.confirm('Are you sure you want to delete this card?')) return
    try {
      const response = await fetch(`${API_BASE}/cards/${filename}/${cardId}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Delete failed')
      setCards(cards.filter(c => c.id !== cardId))
    } catch (error) {
      console.error('Error deleting card:', error)
      alert('Failed to delete card.')
    }
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <h2>Dates</h2>
        <div className="file-list">
          {files.map(file => (
            <button 
              key={file.filename} 
              className={selectedFile === file.filename ? 'active' : ''}
              onClick={() => {
                setSelectedFile(file.filename)
                setSearch({ sc: '', pinyin: '', defn: '', remark: '' })
                fetchCards(file.filename)
              }}
            >
              {file.date.slice(0,4)}-{file.date.slice(4,6)}-{file.date.slice(6,8)}
            </button>
          ))}
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <form onSubmit={handleSearch} className="search-form">
            <input 
              type="text" 
              placeholder="Spelling..." 
              value={search.sc}
              onChange={(e) => setSearch({...search, sc: e.target.value})}
            />
            <input 
              type="text" 
              placeholder="Pinyin..." 
              value={search.pinyin}
              onChange={(e) => setSearch({...search, pinyin: e.target.value})}
            />
            <input 
              type="text" 
              placeholder="Definition..." 
              value={search.defn}
              onChange={(e) => setSearch({...search, defn: e.target.value})}
            />
            <input 
              type="text" 
              placeholder="Remark..." 
              value={search.remark}
              onChange={(e) => setSearch({...search, remark: e.target.value})}
            />
            <button type="submit">Search</button>
          </form>
          <button className="add-btn" onClick={() => setShowAddForm(true)}>+ New Card</button>
        </header>

        {showAddForm && (
          <div className="modal">
            <div className="modal-content">
              <h3>Add New Vocabulary</h3>
              <form onSubmit={handleAddCard}>
                <input placeholder="Simplified (SC)" required value={newCard.headword_sc} onChange={e => setNewCard({...newCard, headword_sc: e.target.value})} />
                <input placeholder="Traditional (TC)" required value={newCard.headword_tc} onChange={e => setNewCard({...newCard, headword_tc: e.target.value})} />
                <input placeholder="Pinyin" required value={newCard.pinyin} onChange={e => setNewCard({...newCard, pinyin: e.target.value})} />
                <textarea placeholder="Definition" required value={newCard.defn} onChange={e => setNewCard({...newCard, defn: e.target.value})} />
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button type="submit">Add Card</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="card-list">
          {loading ? <p>Loading...</p> : cards.map(card => (
            <div key={card.id} className="card-item">
              <div className="card-header">
                <span className="sc">{card.headword_sc}</span>
                <span className="tc">({card.headword_tc})</span>
                <span className="pinyin">{card.pinyin}</span>
                {card.date && <span className="card-date">{card.date}</span>}
                <button className="delete-btn" onClick={() => handleDeleteCard(card.id, card.filename || selectedFile)}>×</button>
              </div>
              <div className="defn">{card.defn}</div>
              <div className="remark-section">
                <input 
                  type="text" 
                  placeholder="Add remark..." 
                  defaultValue={card.remark} 
                  onBlur={(e) => updateRemark(card.id, card.filename || selectedFile, e.target.value)}
                />
              </div>
            </div>
          ))}
          {cards.length === 0 && !loading && <p>No cards found.</p>}
        </div>
      </main>
    </div>
  )
}

export default App
