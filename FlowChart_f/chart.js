let chart = new Vue({
  el: "#chart",
  data: {
    frameList: [],
    linkList: []
  },

  methods: {
    exec: function(src) {
      const filtered = this.filter(src)
      const converted = this.convert(filtered)
      this.format(converted).draw()
    },
    draw: function() {
      let chartString = `${this.frameList.join("\r\n")}\r\n${this.linkList.join("\r\n")}`
      flowchart.parse(chartString).drawSVG('chart')
    },
    convert: function(src) {
      const trimCode = R.curry((title, pattern, src) => {
        const result = src.match(pattern)
        return !result ? src : title + "：" + result[1] // title : ボット名
      })
      const trimRunTask = trimCode(
        "タスク",
        /Run Task.+(?<=\\)([\w\s]+\.atmx|\$[\w\s]+\$)"/
      )
      const trimRunLogic = trimCode(
        "ロジック",
        /Run Logic.+(?<=\\)([\w\s]+\.mbot)/
      )

      return src
        .map(s => trimRunTask(s)) // Run Task行を変換
        .map(s => trimRunLogic(s)) // Run Logic行を変換
    },
    filter: function(src) {
      const targetWordList = [
        /^If/,
        /^Else/,
        /^End If/,
        /^Read From/,
        /Loop/, // TODO:種類によって、Loopの位置が異なる（未調査）
        /^Run (Task|Logic)/,
        /^Stop The Current Task/,
        /^(Create|Copy|Delete) Files/,
        /^Rename Folder/
      ]
      const isMatchCommand = src =>
        targetWordList.find(pattern => src.match(pattern))
      return src
        .split("\r\n")
        .map(s => s.replace(/^[\d]*\t/, "")) // 行番号とタブを削除
        .map(s => s.replace(/     /g, "")) // インデントを削除
        .filter(s => isMatchCommand(s)) // 不要行を削除
    },
    format: function(converted) {
      // ★テストしたい値がある場合はここに定義★
      // return `${this.graph}; id1("abc")-->id2("def"); style id1 fill:#f9f,stroke:#333,stroke-width:2px`

      // 枠関連
      const frameKind = {
        START: "start: ",
        END: "end: ",
        IF: "condition: ",
        CALL: "subroutine: ",
        PROC: "operation: ",
        LOOP: "inputoutput: "
      }
      const createFrame = R.curry(
        (frame, id, description) => `${id}=>${frame}${description}`
      )
      const stFrame = createFrame(frameKind.START, 'st'),
        edFrame = createFrame(frameKind.END),
        ifFrame = createFrame(frameKind.IF),
        callFrame = createFrame(frameKind.CALL),
        procFrame = createFrame(frameKind.PROC),
        loopFrame = createFrame(frameKind.LOOP)

      const linkObject = R.curry((arrow, from, to) => `${from}${arrow}${to}`)
      const normalLink = linkObject("->"),
        yesLink = linkObject("(yes)->"),
        noLink = linkObject("(no)->")

      // 処理判定
      const isMatch = R.curry((pattern, str) => str.match(pattern))
      ;(isIfProc = isMatch(/^If/)),
        (isElseProc = isMatch(/^Else/)),
        (isElseIfProc = isMatch(/^Else If/)),
        (isEndIfProc = isMatch(/^End If/)),
        (isStopTaskProc = isMatch(/^Stop The Current Task/)),
        (isCallTaskProc = isMatch(/^(タスク|ロジック)/)),
        (isLoopProc = isMatch(/^(Start )?Loop/)),
        (isEndLoopProc = isMatch(/^End Loop/)),
        (isExitLoopProc = isMatch(/^Exit Loop$/)),
        (isIfOrElseIfProc = str => isIfProc(str) || isElseIfProc(str)),
        (isCallProc = str => isCallTaskProc(str)),
        (isElseOrElseIfProc = str => isElseProc(str) || isElseIfProc(str)),
        (isElseOrEndIfProc = str => isElseProc(str) || isEndIfProc(str))

      // 処理内容取得
      const getIfCondition = str => {
        const ifConvertRules = [
          { from: /Equal To \(=\)/, to: "＝" },
          { from: /Not Equal To \(<>\)/, to: "＜＞" },
          { from: /File Exist/, to: "ファイルが存在" },
          { from: /File Does Not Exist/, to: "ファイルが存在しない" },
          { from: /Window Exists/, to: "Windowが存在" }
        ]
        let convert = str.match(/(?<=If )(.+)(?= Then)/)[0].replace(/"/g, "'") // ダブルクオーテーションはmermaid.jsで使えない
        ifConvertRules.forEach(v => {
          ;[from, to] = [v.from, v.to]
          convert = convert.replace(from, to)
        })
        return convert
      }

      // 処理解析開始
      const ifProc = [], // 分岐をスタック
        callProc = [], // 呼び出しをスタック
        elseProc = [], // elseをスタック
        stopProc = [], // returnをスタック
        exitLoop = [], // ループ終了箇所をスタック
        normalProc = []

      this.frameList = []
      this.frameList.push(stFrame("start"))

      // 枠の作成
      converted.forEach((v, i) => {
        let obj = ""
        const id = i

        if (isIfOrElseIfProc(v)) {
          obj = ifFrame(id, 'If')
          ifProc.push(id)
        } else if (isCallProc(v)) {
          obj = callFrame(id, v)
          callProc.push(id)
        } else if (isStopTaskProc(v)) {
          obj = edFrame(id, `タスク終了`)
          stopProc.push(id)
        } else if (isExitLoopProc(v)) {
          obj = procFrame(id, "ループ終了")
          exitLoop.push(id)
        } else if (isElseProc(v)) {
          // elseは枠を作らない
          elseProc.push(id)
        } else {
          obj = procFrame(id, v)
          normalProc.push(id)
        }
        if (obj) {
          this.frameList.push(obj)
        }
      })
      this.frameList.push(edFrame(this.frameList.length + 1, `タスク終了`))

      // 枠を連結（Trueルート）
      this.linkList.push("st->0")
      converted.forEach((v, i, a) => {
        const next = a[i + 1]
        const id = i
        const link = isIfOrElseIfProc(v) ? yesLink : normalLink
        if (!next) return // 最後の項目
        if (stopProc.includes(id) || exitLoop.includes(id) || isElseProc(v)) return

        if (!isElseOrElseIfProc(next)) {
          this.linkList.push(link(id, id + 1))
          return
        }
        // Elseの場合、対応するEnd Ifにつなげる
        let ifNestNode = 0
        for (let j = id + 2; j < converted.length - 1; j++) {
          const next = converted[j]
          if (isIfProc(next)) {
            ifNestNode++
            continue
          }
          if (isEndIfProc(next)) {
            if (ifNestNode) {
              ifNestNode--
              continue
            }
            // 対応するEndIfが見つかった
            this.linkList.push(link(id, j))
          }
        }
      })

      // 枠を連結（Elseルート）
      ifProc.forEach((v, i) => {
        let to = 0
        let ifNestNode = 0
        for (let j = v + 1; j < converted.length - 1; j++) {
          const next = converted[j]
          if (isIfProc(next)) {
            ifNestNode++
            continue
          }
          if (isElseOrEndIfProc(next)) {
            if (ifNestNode) {
              ifNestNode--
              continue
            }
            // 対応するelseが見つかった
            to = j + 1 // elseは枠なしなので次へ接続
            break
          }
        }
        this.linkList.push(noLink(v, to))
      })

      // 枠を連結（exit loop）
      exitLoop.forEach((v, i) => {
        let to = 0
        let loopNestNode = 0
        for (let j = v + 1; j < converted.length - 1; j++) {
          const next = converted[j]
          if (isLoopProc(next)) {
            loopNestNode++
            continue
          }
          if (isEndLoopProc(next)) {
            if (loopNestNode) {
              loopNestNode--
              continue
            }
            // 対応するEnd Loopが見つかった
            to = j
            break
          }
        }
        this.linkList.push(normalLink(v, to))
      })

      //   // 別枠で処理を表示する
      //   window.proc.procList = this.procList

      return this
    }
  }
})
window.chart = chart
