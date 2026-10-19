export type Movie = {
  id: number; title: string; genre: string; duration: number; rating: number | null;
  language: string; certificate: string; description: string; poster: string;
};
export type Show = { id: number; movieId: number; startsAt: string; endsAt: string; price: number; available: number };
export type MovieDetail = Movie & { shows: Show[] };
export type ShowDetail = Show & {
  started: boolean; title: string; poster: string; genre: string; duration: number; language: string; certificate: string;
};
export type SeatStatus = 'available' | 'held' | 'booked';
export type Seat = { label: string; status: SeatStatus; mine: boolean };
export type SeatMap = {
  showId: number; rows: string[]; columns: number; available: number; seats: Seat[];
  myHold: { seats: string[]; secondsLeft: number } | null;
};
export type User = { id: number; name: string; email: string; role: 'customer' | 'admin' };
export type Booking = {
  id: number; status: 'CONFIRMED' | 'CANCELLED'; totalAmount: number; createdAt: string; showId: number;
  startsAt: string; title: string; poster: string; language: string; certificate: string; seats: string[]; canCancel: boolean;
};
export type AdminShow = {
  id: number; movieId: number; title: string; startsAt: string; endsAt: string; price: number; started: boolean;
  booked: number; totalSeats: number; percentFull: number; revenue: number;
};
export type AdminBooking = {
  id: number; customerName: string; customerEmail: string; status: string; bookedAt: string; totalAmount: number; seats: string[];
};
