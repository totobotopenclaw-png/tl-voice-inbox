import { useState } from 'react';
import { RecordButton } from '../components/RecordButton';
import { EventsTimeline } from '../components/EventsTimeline';
import { EventDetailPanel } from '../components/EventDetail';
import { Mic, List } from 'lucide-react';

export function Dashboard() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-8">
        {/* Header - Mobile Optimized */}
        <header className="mb-4 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Mic size={20} className="text-white sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">TL Voice Inbox</h1>
              <p className="text-xs sm:text-sm text-slate-400">Local voice capture and organization for Tech Leads</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Left Column - Recording */}
          <div className="space-y-4 sm:space-y-6 order-1">
            {/* Recording Card - Larger touch target on mobile */}
            <div className="bg-slate-900 rounded-xl p-6 sm:p-8 border border-slate-800 mt-16 sm:mt-0">
              <div className="flex flex-col items-center">
                <RecordButton size="lg" />
              </div>
            </div>

            {/* Quick Tips - Collapsible on mobile */}
            <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 border border-slate-800">
              <h3 className="font-medium text-slate-300 mb-2 flex items-center gap-2 text-sm">
                <span className="text-blue-400">💡</span> Quick Tips
              </h3>
              <ul className="text-xs sm:text-sm text-slate-400 space-y-1 list-disc list-inside">
                <li>Speak naturally - mix Spanish and English terms</li>
                <li>Start with commands like "Crear recordatorio..." or "Nota técnica..."</li>
                <li>Events process automatically in the background</li>
              </ul>
            </div>
          </div>

          {/* Right Column - Events */}
          <div className="space-y-4 sm:space-y-6 order-2">
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center gap-2">
                <List size={16} className="text-slate-400 sm:w-[18px] sm:h-[18px]" />
                <h2 className="font-semibold text-slate-200 text-sm sm:text-base">Events Timeline</h2>
              </div>
              
              <div className="p-3 sm:p-4">
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
