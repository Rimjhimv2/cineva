export const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;
export const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
export const dateTimeLabel = (iso: string) => `${dateLabel(iso)}, ${timeLabel(iso)}`;
export const dateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const bookingRef = (id: number) => `CV-${String(id).padStart(6, '0')}`;
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
export const CINEMA = 'Cineva Cinema · Screen 1';
