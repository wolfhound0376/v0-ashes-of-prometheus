/*
 * claude-shim.js — lets the camp pages that began as claude.ai artifacts run
 * inside the game unchanged.
 *
 * In an artifact, `await window.claude.use("db")` returns a small document
 * store. Here it returns the same calls, backed by /api/camp/docs (the
 * `camp_docs` table), so a layout saved in the Map maker or a note written at
 * the fire is the same for everyone, on every device.
 *
 * Load it FIRST, before the page's own scripts:
 *   <script src="/camp/claude-shim.js" data-app="fire"></script>
 *
 * Only the subset the two pages use is implemented:
 *   collection(c).get() / .where(f,"==",v) / .orderBy(f,dir) / .limit(n) /
 *   .onSnapshot(cb, err) / .add(data) / .doc(id)
 *   doc("c/id").get() / .set(data) / .update(data) / .delete() / .onSnapshot(cb, err)
 * onSnapshot polls every few seconds and fires again straight after any write
 * from this page. Writes carry the DM key the game already keeps in this
 * browser (localStorage "aop_forge_key"); the server decides who may write.
 */
(function () {
  "use strict"
  var script = document.currentScript
  var APP = (script && script.getAttribute("data-app")) || "fire"
  var POLL_MS = 4000
  var watchers = []

  function dmKey() {
    try {
      return window.localStorage.getItem("aop_forge_key") || ""
    } catch (e) {
      return ""
    }
  }

  function call(method, params, body) {
    var url = "/api/camp/docs"
    if (params) {
      var q = new URLSearchParams({ app: APP })
      for (var k in params) if (params[k] !== undefined && params[k] !== null) q.set(k, String(params[k]))
      url += "?" + q.toString()
    }
    var init = { method: method, headers: { "x-dm-key": dmKey() }, cache: "no-store" }
    if (body) {
      init.headers["content-type"] = "application/json"
      init.body = JSON.stringify(Object.assign({ app: APP }, body))
    }
    return fetch(url, init).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) {
          var e = new Error((j && j.error) || "camp docs " + r.status)
          e.code = (j && j.error) || "http " + r.status
          throw e
        }
        return j
      })
    })
  }

  function snapOf(id, data) {
    return {
      id: id,
      exists: data !== null && data !== undefined,
      data: function () {
        return data === null || data === undefined ? undefined : JSON.parse(JSON.stringify(data))
      },
    }
  }

  function querySnap(list) {
    var docs = list.map(function (d) {
      return snapOf(d.id, d.data)
    })
    return { docs: docs, size: docs.length, empty: docs.length === 0, forEach: function (f) { docs.forEach(f) } }
  }

  function refreshAll() {
    watchers.forEach(function (w) {
      w.tick()
    })
  }

  function watch(fetcher, cb, err) {
    var last = null
    var alive = true
    var w = {
      tick: function () {
        if (!alive) return
        fetcher().then(
          function (res) {
            var s = JSON.stringify(res.raw)
            if (s === last || !alive) return
            last = s
            try {
              cb(res.snap)
            } catch (e) {
              console.error(e)
            }
          },
          function (e) {
            if (err) err(e)
          },
        )
      },
    }
    watchers.push(w)
    w.tick()
    var t = setInterval(w.tick, POLL_MS)
    return function unsubscribe() {
      alive = false
      clearInterval(t)
      watchers = watchers.filter(function (x) {
        return x !== w
      })
    }
  }

  function docRef(collection, id) {
    function write(op, data) {
      return call("POST", null, { collection: collection, op: op, id: id, data: data }).then(function () {
        refreshAll()
      })
    }
    function fetchOne() {
      return call("GET", { collection: collection, id: id }).then(function (j) {
        var d = j.doc ? j.doc.data : null
        return { raw: d, snap: snapOf(id, d) }
      })
    }
    return {
      id: id,
      get: function () {
        return fetchOne().then(function (r) {
          return r.snap
        })
      },
      set: function (data) {
        return write("set", data)
      },
      update: function (data) {
        return write("update", data)
      },
      delete: function () {
        return write("delete")
      },
      onSnapshot: function (cb, err) {
        return watch(fetchOne, cb, err)
      },
    }
  }

  function query(collection, opts) {
    function fetchMany() {
      return call("GET", Object.assign({ collection: collection }, opts)).then(function (j) {
        return { raw: j.docs, snap: querySnap(j.docs || []) }
      })
    }
    return {
      where: function (f, op, v) {
        if (op !== "==") throw new Error("claude-shim: only == is supported")
        return query(collection, Object.assign({}, opts, { where: f, eq: v }))
      },
      orderBy: function (f, dir) {
        return query(collection, Object.assign({}, opts, { order: f, dir: dir || "asc" }))
      },
      limit: function (n) {
        return query(collection, Object.assign({}, opts, { limit: n }))
      },
      get: function () {
        return fetchMany().then(function (r) {
          return r.snap
        })
      },
      onSnapshot: function (cb, err) {
        return watch(fetchMany, cb, err)
      },
      doc: function (id) {
        return docRef(collection, id)
      },
      add: function (data) {
        return call("POST", null, { collection: collection, op: "add", data: data }).then(function (j) {
          refreshAll()
          return docRef(collection, j.id)
        })
      },
    }
  }

  var db = Object.freeze({
    collection: function (c) {
      return query(c, {})
    },
    doc: function (path) {
      var i = String(path).indexOf("/")
      return docRef(path.slice(0, i), path.slice(i + 1))
    },
  })

  var existing = window.claude
  window.claude = {
    use: function (name) {
      if (name === "db") return Promise.resolve(db)
      return existing && existing.use ? existing.use(name) : Promise.resolve(null)
    },
  }
})()
