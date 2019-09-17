let proc = new Vue({
    el: '#proc',
    data: {
        procList: []
    },
    methods: {
        modify: function (index) {
            let prevItem = this.procList[index]
            let result = prevItem.match(/\$.+\$/)
            if (!result) return
            let taskName = result[0]
            let newTaskName = window.prompt(`新しいタスク名を入力してください：${taskName}`)
            if (newTaskName) {
                this.procList[index] = prevItem.replace(/\$.+\$/, newTaskName)
                this.procList.push(this.procList.pop())
                window.chart.modify(index, newTaskName, this.procList)
            }
            
        }
    }
})
window.proc = proc