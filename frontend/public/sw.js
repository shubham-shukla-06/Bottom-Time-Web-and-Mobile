/* Service Worker for Bottom Time Push Notifications */

self.addEventListener('push', (event) => {
  let data = { title: 'Bottom Time', body: 'You have a new notification' };
  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data?.text() || data.body;
  }

  const ICON_URL = '/icon.svg';

  const options = {
    body: data.body,
    icon: ICON_URL,
    badge: ICON_URL,
    tag: data.type || 'general',
    renotify: true,
    data: { type: data.type, ...data.data },
    actions: [],
  };

  // Customize by notification type
  if (data.type === 'new_message') {
    options.actions = [{ action: 'open_chat', title: 'Open Chat' }];
  } else if (data.type === 'booking_new' || data.type === 'booking_update') {
    options.actions = [{ action: 'view', title: 'View' }];
  } else if (data.type === 'connection_request') {
    options.actions = [{ action: 'view', title: 'View Request' }];
  }

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const type = event.notification.data?.type;
  let url = '/';

  if (type === 'new_message') url = '/messages';
  else if (type === 'booking_new') url = '/operator';
  else if (type === 'booking_update') url = '/bookings';
  else if (type === 'connection_request' || type === 'connection_accepted') url = '/community';
  else if (type === 'listing_approved' || type === 'listing_rejected') url = '/operator';
  else if (type === 'trip_shared') url = '/discover';
  else url = '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
