self.addEventListener("install", e => {
    console.log("Service Worker Installed")
})

self.addEventListener("push", function (event) {

    const data = event.data.json()

    // 🔥 HANDLE ENDED CALL UI
    let title = data.title
    let body = data.body

    if (data.status === "ended") {

    const caller = data.from || "Unknown"
    const callType = data.type === "video" ? "Video" : "Voice"

    if (data.isGroup) {

        // ✅ SHOW GROUP NAME (coming from backend title)
        const groupName = data.title || "Group"

        title = `❌ ${groupName} ${callType} Call Ended`

        // ✅ SAFE BODY
        body = `Missed ${callType} call from ${caller}`

    } else {

        title = `❌ Missed ${callType} Call`
        body = `From: ${caller}`
    }
}

    const options = {
        body: body,
        icon: "/icon.png",
        badge: "/icon.png",

        tag: data.tag || data.from, // 🔥 IMPORTANT (same notification)

        renotify: true,

        data: data
    }

    event.waitUntil(
        self.registration.showNotification(title, options)
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
