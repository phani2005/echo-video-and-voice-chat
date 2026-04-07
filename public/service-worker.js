const CACHE_NAME = "chat-app-v4";

const urlsToCache = [
  "/login.html",
  "/main.html",
  "/chat.html",
  "/style.css",
  "/main.css",
  "/chat.css",
  "/main.js",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json"
];
self.addEventListener("install", event => {
    console.log("Service Worker Installed");

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log("🗑️ Deleting old cache:", key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});
self.addEventListener("fetch", event => {

    const url = event.request.url;

    // ❌ NEVER CACHE THESE (VERY IMPORTANT)
    if (
        url.includes("/socket.io") ||
        url.includes("/api") ||
        url.includes("/messages") ||
        url.includes("/conversations") ||
        url.includes("/getcontacts") ||
        url.includes("/upload-message") ||
        url.includes("/subscribe") ||
        url.includes("/delete") ||
        event.request.method !== "GET"
    ) {
        return fetch(event.request); // always fresh data
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request).then(fetchRes => {

                    if (!fetchRes || fetchRes.status !== 200) {
                        return fetchRes;
                    }

                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, fetchRes.clone());
                        return fetchRes;
                    });
                });
            })
            .catch(() => caches.match("/login.html"))
    );
});
self.addEventListener("push", function (event) {

    const data = event.data ? event.data.json() : {};

    // 🔥 HANDLE ENDED CALL UI
    let title = data.title
    let body = data.body

    if (data.status === "ended") {

    const caller = data.callerName || data.from || "Unknown"
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
        icon: "/icon-192.png",
        badge: "/icon-192.png",

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
