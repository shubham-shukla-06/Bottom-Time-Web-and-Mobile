import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import Navbar from '../components/Navbar';

export default function DiveLog() {
  const [logs, setLogs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    date: '',
    depth: '',
    duration: '',
    water_temp: '',
    visibility: '',
    notes: '',
    buddy: ''
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await axios.get('/dive-logs');
      setLogs(response.data);
    } catch (error) {
      toast.error('Failed to load dive logs');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/dive-logs', {
        ...formData,
        depth: parseFloat(formData.depth),
        duration: parseInt(formData.duration),
        water_temp: formData.water_temp ? parseFloat(formData.water_temp) : null
      });
      toast.success('Dive logged successfully!');
      setShowForm(false);
      setFormData({
        title: '',
        location: '',
        date: '',
        depth: '',
        duration: '',
        water_temp: '',
        visibility: '',
        notes: '',
        buddy: ''
      });
      fetchLogs();
    } catch (error) {
      toast.error('Failed to create dive log');
    }
  };

  const handleDelete = async (logId) => {
    if (!window.confirm('Delete this dive log?')) return;
    try {
      await axios.delete(`/dive-logs/${logId}`);
      toast.success('Dive log deleted');
      fetchLogs();
    } catch (error) {
      toast.error('Failed to delete dive log');
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-12" data-testid="dive-log-page">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Dive Log</h1>
          <button 
            onClick={() => setShowForm(true)} 
            className="btn-primary flex items-center gap-2"
            data-testid="add-dive-btn"
          >
            <Plus size={20} /> Log New Dive
          </button>
        </div>

        {logs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {logs.map(log => (
              <div key={log.id} className="glass-card rounded-3xl p-6" data-testid="dive-log-card">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold">{log.title}</h3>
                  <button onClick={() => handleDelete(log.id)} className="text-red-400 hover:text-red-300" data-testid="delete-dive-btn">
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <p><span className="text-slate-500">Location:</span> {log.location}</p>
                  <p><span className="text-slate-500">Date:</span> {new Date(log.date).toLocaleDateString()}</p>
                  <p><span className="text-slate-500">Depth:</span> {log.depth}m</p>
                  <p><span className="text-slate-500">Duration:</span> {log.duration} minutes</p>
                  {log.water_temp && <p><span className="text-slate-500">Water Temp:</span> {log.water_temp}°C</p>}
                  {log.visibility && <p><span className="text-slate-500">Visibility:</span> {log.visibility}</p>}
                  {log.buddy && <p><span className="text-slate-500">Buddy:</span> {log.buddy}</p>}
                  {log.notes && <p className="text-slate-400 mt-3">{log.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-3xl p-12 text-center">
            <p className="text-slate-400 text-lg" data-testid="no-logs-message">No dive logs yet. Start recording your underwater adventures!</p>
          </div>
        )}

        {/* Add Dive Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4" data-testid="dive-form-modal">
            <div className="glass-card rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Log New Dive</h2>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white" data-testid="close-form-btn">
                  ✕
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="dive-form">
                <input
                  type="text"
                  placeholder="Dive Title *"
                  className="input-field"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  required
                  data-testid="dive-title-input"
                />
                <input
                  type="text"
                  placeholder="Location *"
                  className="input-field"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  required
                  data-testid="dive-location-input"
                />
                <input
                  type="date"
                  className="input-field"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  required
                  data-testid="dive-date-input"
                />
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="number"
                    placeholder="Depth (meters) *"
                    className="input-field"
                    value={formData.depth}
                    onChange={(e) => setFormData({...formData, depth: e.target.value})}
                    step="0.1"
                    required
                    data-testid="dive-depth-input"
                  />
                  <input
                    type="number"
                    placeholder="Duration (minutes) *"
                    className="input-field"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: e.target.value})}
                    required
                    data-testid="dive-duration-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="number"
                    placeholder="Water Temp (°C)"
                    className="input-field"
                    value={formData.water_temp}
                    onChange={(e) => setFormData({...formData, water_temp: e.target.value})}
                    step="0.1"
                    data-testid="dive-water-temp-input"
                  />
                  <input
                    type="text"
                    placeholder="Visibility (e.g., Good, 10m)"
                    className="input-field"
                    value={formData.visibility}
                    onChange={(e) => setFormData({...formData, visibility: e.target.value})}
                    data-testid="dive-visibility-input"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Dive Buddy"
                  className="input-field"
                  value={formData.buddy}
                  onChange={(e) => setFormData({...formData, buddy: e.target.value})}
                  data-testid="dive-buddy-input"
                />
                <textarea
                  placeholder="Notes"
                  className="input-field"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  data-testid="dive-notes-input"
                />
                <button type="submit" className="btn-primary w-full" data-testid="submit-dive-btn">
                  Save Dive Log
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}