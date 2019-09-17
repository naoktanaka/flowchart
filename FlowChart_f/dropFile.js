// ファイル読み込み
var elDrop = document.getElementById('dropzone')
elDrop.addEventListener('dragover', function(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    showDropping()
});

elDrop.addEventListener('dragleave', function(event) {
    hideDropping()
})

elDrop.addEventListener('drop', function(event) {
    event.preventDefault()
    hideDropping()

    let file = event.dataTransfer.files[0]
    readFile(file)
});

function showDropping() {
    elDrop.classList.add('dropover');
}

function hideDropping() {
    elDrop.classList.remove('dropover');
}

function readFile(file) {
    let reader = new FileReader()
    reader.onload = e => {
        createFlowChart(e.target.result)
    }
    reader.readAsText(file)
}

function createFlowChart (src) {
    if (!src) alert('ファイル読み込みできません。')

    document.getElementById('dropzone').style.display ="none"
    document.getElementById('mode').style.display = "none"
    chart.$el.style.display = 'block'
    proc.$el.style.display = 'block'
    chart.exec(src)
}

