// The areas a partner can say they are in when they do not want to share GPS.
// The same list as the website's (PLACES in lib/data.ts).

import type { Place } from './types';

export const PLACES: Place[] = [
  { label: 'PES University', sub: 'Banashankari 3rd Stage', lat: 12.9345, lng: 77.5345 },
  { label: 'Banashankari 2nd Stage', sub: 'Near BDA Complex', lat: 12.9255, lng: 77.5468 },
  { label: 'Jayanagar 4th Block', sub: 'Near the bus stand', lat: 12.9299, lng: 77.5826 },
  { label: 'Basavanagudi', sub: 'Gandhi Bazaar main road', lat: 12.9422, lng: 77.5738 },
  { label: 'JP Nagar 2nd Phase', sub: 'Near the mini forest', lat: 12.9063, lng: 77.5857 },
  { label: 'Rajarajeshwari Nagar', sub: 'Near the arch', lat: 12.915, lng: 77.52 },
  { label: 'Vijayanagar', sub: 'Near the metro station', lat: 12.9719, lng: 77.535 },
  { label: 'Koramangala 5th Block', sub: 'Near Jyoti Nivas College', lat: 12.9352, lng: 77.6245 },
  { label: 'Whitefield', sub: 'ITPL main road', lat: 12.9698, lng: 77.75 },
];

/** The label the app gives a position from the phone's GPS. The website uses the same one. */
export const GPS_LABEL = 'Current location';
