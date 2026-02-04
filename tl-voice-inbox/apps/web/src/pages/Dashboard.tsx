import { useState } from 'react';
import { RecordButton } from '../components/RecordButton';
import { EventsTimeline } from '../components/EventsTimeline';
import { EventDetailPanel } from '../components/EventDetail';
import { Mic, List } from 'lucide-react';

export function Dashboard() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Mic size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">TL Voice Inbox</h1>
              <p className="text-slate-400">Local voice capture and organization for Tech Leads</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Recording */}
          <div className="space-y-6">
            {/* Recording Card */}
            <div className="bg-slate-900 rounded-xl p-8 border border-slate-800">
              <div className="flex flex-col items-center">
                <RecordButton size="lg" />
              </div>
            </div>

            {/* Quick Tips */}
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
              <h3 className="font-medium text-slate-300 mb-2 flex items-center gap-2">
                <span className="text-blue-400">💡</span> Quick Tips
              </h3>
              <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
                <li>Speak naturally - mix Spanish and English terms</li>
                <li>Start with commands like "Crear recordatorio..." or "Nota técnica..."</li>
                <li>Events process automatically in the background</li>
              </ul>
            </div>
          </div>

          {/* Right Column - Events */}
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                <List size={18} className="text-slate-400" />
                <h2 className="font-semibold text-slate-200">Events Timeline</h2>
              </div>
              
              <div className="p-4">
                {selectedEventId ? (
                  <EventDetailPanel 
                    eventId={selectedEventId} 
                    onClose={() => setSelectedEventId(null)} 
                  />
                ) : (
                  <EventsTimeline 
                    onEventClick={setSelectedEventId}
                    selectedEventId={selectedEventId}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
