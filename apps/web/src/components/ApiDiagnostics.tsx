import { useState, useEffect } from 'react';

export function ApiDiagnostics() {
  const [results, setResults] = useState<Array<{name: string; status: 'ok' | 'error' | 'loading'; message?: string}>>([]);
  const [isOpen, setIsOpen] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const runTests = async () => {
    const tests = [
      { name: 'Health Check', url: `${API_URL}/api/health` },
      { name: 'Actions API', url: `${API_URL}/api/actions?limit=1` },
      { name: 'Knowledge API', url: `${API_URL}/api/knowledge?limit=1` },
    ];

    setResults(tests.map(t => ({ name: t.name, status: 'loading' })));

    for (let i = 0; i < tests.length; i++) {
      try {
        const response = await fetch(tests[i].url, { 
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (response.ok) {
          setResults(prev => prev.map((r, idx) => 
            idx === i ? { name: tests[i].name, status: 'ok', message: `HTTP ${response.status}` } : r
          ));
        } else {
          setResults(prev => prev.map((r, idx) => 
            idx === i ? { name: tests[i].name, status: 'error', message: `HTTP ${response.status}` } : r
          ));
        }
      } catch (err) {
        setResults(prev => prev.map((r, idx) => 
          idx === i ? { name: tests[i].name, status: 'error', message: err instanceof Error ? err.message : 'Network error' } : r
        ));
      }
    }
  };

  useEffect(() => {
    if (isOpen) runTests();
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 px-3 py-2 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 z-50"
      >
        API Diagnostics
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-200">API Diagnostics</h3>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-200">×</button>
      </div>
      
      <div className="text-xs text-slate-500 mb-2">API URL: {API_URL}</div>
      
      <div className="space-y-2 mb-3">
        {results.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">{r.name}</span>
            <span className={`
              ${r.status === 'ok' ? 'text-emerald-400' : r.status === 'error' ? 'text-red-400' : 'text-amber-400'}
            `}>
              {r.status === 'loading' ? '⏳' : r.status === 'ok' ? '✓' : '✗'} {r.message || r.status}
            </span>
          </div>
        ))}
      </div>

      <div className="text-xs text-slate-500 space-y-1 border-t border-slate-800 pt-2">
        <p><strong>ERR_BLOCKED_BY_CLIENT?</strong></p>
        <ul className="list-disc list-inside">
          <li>Disable ad blockers</li>
          <li>Use Incognito/Private mode</li>
          <li>Check browser console for CORS errors</li>
        </ul>
      </div>

      <button 
        onClick={runTests}
        className="mt-3 w-full px-3 py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-500"
      >
        Re-run Tests
      </button>
    </div>
  );
}
