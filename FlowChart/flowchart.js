let chart = new Vue({
    el: '#chart',
    data: {
        graphKind: 'graph TD',
        flowchart: '',
        procList: [],
        mermaidObject: []
    },
    methods: {
        exec: function(src) {
            // ソースをmermaid形式へ変換
            this.flowchart = this.toMermaidFormat(this.convert(src))
            this.draw()
        },
        draw: function() {
            chart.$el.removeAttribute('data-processed')
            // mermaidがinnerHTMLを書き換えるため、vueの{{flowchart}}では再描画できない
            chart.$el.innerHTML = this.flowchart
            mermaid.init()
        },
        modify: function(index, newItem, procList) {
            this.procList = procList
            const prevItem = this.mermaidObject[index + 1]
            this.mermaidObject[index + 1] = prevItem.replace(/\$.*\$/, newItem)
            this.flowchart = this.mermaidObject.join('; ')
            this.draw()
        },
        convert: function(src) {
            const trimCode = R.curry((title, pattern, src) => {
                const result = src.match(pattern)
                return !result ? src : title + '：' + result[1] // title : ボット名
            })
            const trimRunTask = trimCode('タスク', /Run Task.+(?<=\\)([\w\s]+\.atmx|\$[\w\s]+\$)"/)
            const trimRunLogic = trimCode('ロジック', /Run Logic.+(?<=\\)([\w\s]+\.mbot)/)

            return this.filter(src)
                .map(s => trimRunTask(s)) // Run Task行を変換
                .map(s => trimRunLogic(s)) // Run Logic行を変換
        },
        filter: function(src) {
            const targetWordList = [
                // /^(Begin|End) Error Handling/,
                // /^Comment:/,
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
            const isMatchCommand = src => targetWordList.find(pattern => src.match(pattern))
            return src.split('\r\n')
                .map(s => s.replace(/^[\d]*\t/, '')) // 行番号とタブを削除
                .map(s => s.replace(/     /g, '')) // インデントを削除
                .filter(s => isMatchCommand(s)) // 不要行を削除
        },
        toMermaidFormat(converted) {
            // ★テストしたい値がある場合はここに定義★
            // return `${this.graph}; id1("abc")-->id2("def"); style id1 fill:#f9f,stroke:#333,stroke-width:2px`

            // 矢印関連
            const createArrow = comment => comment ? `-- ${comment} -->` : '-->'
            const 
             normalArrow = createArrow(),
             yesArrow = createArrow('Yes'),
             noArrow = createArrow('No'),
             warpArrow = '-.->'

            // 枠関連
            const createFrame = R.curry((l, r, id, description) => `${id}${l}"${description}"${r}`)
             procFrame = createFrame('(', ')'),
             ifFrame = createFrame('{', '}'),
             callFrame = createFrame('[', ']'),
             stopFrame = createFrame('>', ']'),
             endFrame = createFrame('((', '))'),

             chainFrame = (from, to, arrow) => `${from}${arrow}${to}`,
             closeFrame = from => from

            // 処理判定
            const isMatch = R.curry((pattern, str) => str.match(pattern))
            const
             isIfProc = isMatch(/^If/),
             isElseProc = isMatch(/^Else$/),
             isElseIfProc = isMatch(/^Else If/),
             isEndIfProc = isMatch(/^End If/),
             isStopTaskProc = isMatch(/^Stop The Current Task/),
             isCallTaskProc = isMatch(/^(タスク|ロジック)/),
             isLoopProc = isMatch(/^(Start )?Loop/),
             isEndLoopProc = isMatch(/^End Loop/),
             isExitLoopProc = isMatch(/^Exit Loop$/),

             isIfOrElseIfProc = str => isIfProc(str) || isElseIfProc(str),
             isCallProc = str => isCallTaskProc(str),
             isElseOrEndIfProc = str =>  isElseProc(str) || isEndIfProc(str),
             isElseOrElseIfProc = str => isElseProc(str) || isElseIfProc(str)
             isElseOrElseIfOrEndIfProc = str => isElseProc(str) || isEndIfProc(str) || isElseIfProc(str)

            // 処理内容取得
            const getIfCondition = str => {
                const ifConvertRules = [
                    { from: /Equal To \(=\)/, to: '＝' },
                    { from: /Not Equal To \(<>\)/, to: '＜＞' },
                    { from: /File Exist/, to: 'ファイルが存在' },
                    { from: /File Does Not Exist/, to: 'ファイルが存在しない' },
                    { from: /Window Exists/, to: 'Windowが存在' }
                ]
                let convert = str.match(/(?<=If )(.+)(?= Then)/)[0].replace(/"/g, "'") // ダブルクオーテーションはmermaid.jsで使えない
                ifConvertRules.forEach(v => {
                    [from, to] = [v.from, v.to]
                    convert = convert.replace(from, to)
                })
                return convert
            }

            // 処理解析開始
            const 
             ifProc = [], // 分岐をスタック
             callProc = [], // 呼び出しをスタック
             elseProc = [], // elseをスタック
             stopProc = [], // returnをスタック
             exitLoop = [], // ループ終了箇所をスタック
             normalProc = []

            let mermaidObject = this.mermaidObject
            mermaidObject.push(this.graphKind) // graph TD

            // 枠の作成
            let flowIndex = 1;
            converted.forEach((v, id) => {
                let obj = ''

                if (isIfOrElseIfProc(v)) {
                    this.procList.push(getIfCondition(v))
                    obj = ifFrame(id, `${flowIndex++}：If`)
                    ifProc.push(id)
                } else if (isCallProc(v)) {
                    this.procList.push(v)
                    obj = callFrame(id, `${flowIndex++}：${v}`)
                    callProc.push(id)
                } else if (isStopTaskProc(v)) {
                    this.procList.push('タスク終了')
                    obj = endFrame(id, `${flowIndex++}：終了`)
                    stopProc.push(id)
                } else if (isExitLoopProc(v)) {
                    this.procList.push('Exit Loop')
                    obj = stopFrame(id, `${flowIndex++}：ループ終了`)
                    exitLoop.push(id)
                } else if (isElseProc(v)){
                    // 枠を作らない
                    elseProc.push(id)
                } else {
                    const delDQ = v.replace(/"/g, "'")
                    this.procList.push(delDQ)
                    obj = procFrame(id, `${flowIndex++}：${delDQ}`)
                    normalProc.push(id)
                }
                if (obj) mermaidObject.push(obj)
            })
            mermaidObject.push(`${converted.length-1}-->ed(("終了"))`)

            // 枠を連結（Trueルート）
            converted.forEach((v, id, a) => {
                const next = a[id + 1]
                const arrow = isIfOrElseIfProc(v) ? yesArrow : normalArrow
                if (!next) return // 最後の項目
                if (stopProc.includes(id) || exitLoop.includes(id) || isElseProc(v)) return

                if (!isElseOrElseIfProc(next)) {
                    mermaidObject.push(chainFrame(id, id + 1, arrow))
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
                        mermaidObject.push(chainFrame(id, j, arrow))
                    }
                }
            })

            // 枠を連結（Elseルート）
            ifProc.forEach((v, id) => {
                let to = 0
                let ifNestNode = 0
                for (let j = v + 1; j < converted.length - 1; j++) {
                    const next = converted[j]
                    if (isIfProc(next)) {
                        ifNestNode++
                        continue
                    }
                    if (isElseOrElseIfOrEndIfProc(next)) {
                        if (ifNestNode && isElseIfProc(next)) continue // nest時のElseIfは無視
                        if (ifNestNode) {
                            ifNestNode--
                            continue
                        }
                        // 対応するelseが見つかった
                        to = isElseProc(next) ? j + 1 : j // elseは枠が無いため次の項目
                        break
                    }
                }
                mermaidObject.push(chainFrame(v, to, noArrow))
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
                mermaidObject.push(chainFrame(v, to, warpArrow))
            })

            // 呼び出し枠のスタイル
            // 最後の枠に色が付かないのでペンディング、mermaidのバグ？
            // callProc.forEach(v => mermaidObject.push(`style ${v} fill:#f9f,stroke:#333,stroke-width:2px`))
            // normalProc.forEach(v => mermaidObject.push(`style ${v} width:150`))
            // ifProc.forEach(v => mermaidObject.push(`style ${v} fill:#f9f`))

            // ホバー
            this.procList.forEach((v, i) => mermaidObject.push(`click ${i} callback "${v}"`))

            // 別枠で処理を表示する
            window.proc.procList = this.procList
            return mermaidObject.join('; ')
        }
    }
})
window.chart = chart
