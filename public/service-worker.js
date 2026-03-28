self.addEventListener("install", e => {
    console.log("Service Worker Installed")
})

self.addEventListener("push", function (event) {

    const data = event.data.json()

    // 🔥 UNIQUE TAG PER CHAT (VERY IMPORTANT)
    const tag = data.isGroup ? data.from : data.from

    // 🔥 MULTIPLE MESSAGES SUPPORT
    let messages = data.messages || [data.body]

    const options = {
        body: messages.join("\n"),   // 👈 show multiple messages
        icon: "/icon.png",
        badge: "/icon.png",
        tag: tag,                   // 🔥 SAME TAG = SINGLE NOTIFICATION
        renotify: true,             // 🔥 vibrate again
        data: {
            ...data,
            messages: messages
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    )
})

self.addEventListener("notificationclick", function (event) {

    event.notification.close()

    const data = event.notification.data || {}

    let url = data.url || "/chat.html"

    const params = `?from=${data.from || ""}&type=${data.type || ""}&isGroup=${data.isGroup || false}&name=${data.title || ""}&openChat=true`

    if (data.isGroup && data.type === "voice") {
        url = "/groupvoicecall.html"
    }
    else if (data.isGroup && data.type === "video") {
        url = "/groupvideocall.html"
    }
    else if (data.type === "voice") {
        url = "/voicechat.html"
    }
    else if (data.type === "video") {
        url = "/videocall.html"
    }

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true })
            .then(clientList => {

                // 🔥 FOR CALLS → ALWAYS OPEN NEW PAGE
                if (data.type === "voice" || data.type === "video") {
                    return clients.openWindow(url + params)
                }

                // 🔥 FOR CHAT → reuse tab
                // for (const client of clientList) {
                //     if ("focus" in client) {
                //         client.focus()
                //         client.postMessage({
                //             action: "open-chat",
                //             data: data
                //         })
                //         return
                //     }
                // }

                return clients.openWindow(url + params)

            })
    )
})
