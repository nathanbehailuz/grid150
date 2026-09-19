import './App.css'
import { isSupabaseConfigured } from './lib/supabase'

function App() {
  return (
    <main className="shell">
      <h1>Grid150</h1>
      <p className="lede">
        Competitive accountability for the NeetCode 150. Implementation is in
        progress (P0 foundations).
      </p>
      <ul className="links">
        <li>
          Product rules:{' '}
          <code>docs/PRODUCT_BRIEF.md</code>
        </li>
        <li>
          Screen inventory:{' '}
          <code>docs/design.md</code> and <code>mockups/</code>
        </li>
        <li>
          Build roadmap: <code>docs/PRD.md</code>
        </li>
      </ul>
      <p className="status" data-testid="supabase-status">
        Supabase:{' '}
        {isSupabaseConfigured ? 'configured' : 'env not set (see .env.example)'}
      </p>
    </main>
  )
}

export default App
