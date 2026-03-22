self.addEventListener("install", e => {
    console.log("Service Worker Installed")
})

self.addEventListener("push", event => {

    const data = event.data.json()

    self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon.png",
        data: {
            url: data.url
        }
    })
})

self.addEventListener("notificationclick", event => {

    event.notification.close()

    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    )
})