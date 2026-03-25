self.addEventListener("install", e => {
    console.log("Service Worker Installed")
})

self.addEventListener("push", function (event) {

    const data = event.data.json()

    const options = {
        body: data.body,
        icon: "/icon.png",
        badge: "/icon.png",
        data: data
    }

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    )
})

self.addEventListener("notificationclick", function (event) {

    event.notification.close()

    const data = event.notification.data

    let url = data.url || "/chat.html"

    if (data.type === "voice") {
        url = "/voicechat.html"
    } else if (data.type === "video") {
        url = "/videocall.html"
    }

    // 🔥 PASS DATA USING URL PARAMS
    url += `?from=${data.from}&type=${data.type}`

    event.waitUntil(
        clients.openWindow(url)
    )
})
