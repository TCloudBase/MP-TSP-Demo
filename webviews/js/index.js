window.get = getQueryString()
window.tcbWebBase.init({
  cloudbase: {
    envid: '' // 填写为云函数所在的云开发环境ID
  },
  data: {
    fullscreenLoading: false,
    login_load: false,
    donelogin: false,
    chat_view: true,
    chat_model: true,
    chat_model_mess: [],
    chat_model_openid: null,
    chat_input_mess: '',
    chat_input_flag: false,
    chatImage_showflag: false,
    chatImage_showsrc: '',
    deploy_load: false,
    deploy_step: 0,
    deploybtn_load: false,
    codeshow_flag: false,
    chat_mess_list: {},
    openid_userinfo: {},
    func_list: [],
    mess_info: {
      name: '',
      des: '',
      img: '',
      pimg: '',
      appok: false,
      messok: false
    }
  },
  created () {
    loginstate() // 登录检测
    /* 根据屏幕宽确定面板展示 */
    if (document.body.clientWidth < 600) {
      window.app.chat_model = false
      window.app.chat_view = false
    } else if (document.body.clientWidth < 800) {
      window.app.chat_model = false
    }
  },
  methods: {
    tologin: async () => { // 执行登录
      window.app.login_load = true
      await window.getPreurl()
      window.app.login_load = false
    },
    outlogin: outlogin, // 退出登录
    hidechat () { // 隐藏聊天面板
      window.app.chat_model = false
    },
    showchat (e) { // 显示聊天面板
      window.chat_watchOpen(e.$options.propsData.index) // 打开对应的用户，并装载相应的信息
      window.app.chat_model = true
      setTimeout(function () { // 延迟100ms做拉至底部
        const chatel = document.getElementById('chat_list')
        chatel.scrollTop = chatel.scrollHeight
      }, 100)
    },
    showchatImage (e) { // 展示聊天图片
      window.app.chatImage_showflag = true
      window.app.chatImage_showsrc = e.path[0].currentSrc
    },
    hidechatImage () { // 隐藏聊天图片
      window.app.chatImage_showflag = false
    },
    saveapp: savedata, // 保存信息
    tochatview () {
      window.app.chat_view = true
    },
    toinfoview () {
      window.app.chat_view = false
    },
    onChat_input () { // 聚焦聊天输入框，并自动已读消息
      window.app.chat_input_flag = true
      window.setOutTime()
    },
    unChat_input () {
      window.app.chat_input_flag = false
    }
  }
})

/**
 * 监听键盘shift+enter组合，并执行发送消息
 * @param {*} e
 */
document.onkeydown = async function (e) {
  var keyCode = e.keyCode || e.which || e.charCode
  var shiftKey = e.shiftKey
  if (shiftKey && keyCode === 13) {
    e.preventDefault()
    if (window.app.chat_input_flag) {
      await window.chat_send()
    }
  }
}

/**
 * 初始化加载应用信息（授权列表，应用基础信息）
 */
async function init () {
  const res = await window.app_getInfo()
  if (res.data != null) {
    window.app.mess_info = res.data
    if (res.data.messok === true) {
      window.chat_watch()
    }
  }
  window.app.donelogin = true
  window.app.fullscreenLoading = false
  const authorizerData = await window.getAuthorizer()
  if (authorizerData.msg != null) {
    window.app.$notify.error({
      title: '服务登录异常，请重新操作登录！',
      message: authorizerData.msg,
      duration: 0
    })
    outlogin()
  } else {
    window.app.func_list = authorizerData.result.func_list
  }
}

/**
 * 保存应用信息，并判断执行部署流程
 */
async function savedata () {
  window.app.$confirm('保存信息将直接对当前运行应用生效，请谨慎操作', '提示', {
    confirmButtonText: '保存',
    cancelButtonText: '取消'
  }).then(async () => {
    window.app.deploybtn_load = true
    await window.app_saveInfo(window.app.mess_info)
    if (window.app.mess_info.appok === true) {
      window.app.$confirm('是否需要重新部署应用？如果不做升级建议不重新部署', '提示', {
        confirmButtonText: '不需要',
        cancelButtonText: '重新部署',
        type: 'warning'
      }).catch(async () => {
        await window.depoly_start()
      })
    } else {
      await window.depoly_start()
    }
    window.app.deploybtn_load = false
  }).catch(e => { })
}

/**
 * 确认授权状态
 * 原理：使用第三方平台重新授权登录回调的CODE，在后台获取登录ticket，操作自定义登录
 */
async function confirmlogin () {
  const confirmData = await window.confirmAuth()
  await window.auth.customAuthProvider().signIn(confirmData.ticket)
  window.location.href = window.location.origin + window.location.pathname
}

/**
 * 退出授权登录
 */
async function outlogin () {
  await window.auth.signOut()
  loginstate()
}

/**
 * 登录状态初始化
 * 如果是自定义登录，则执行init流程，否则匿名登录状态，并判断是否有授权code
 */
function loginstate () {
  window.app.fullscreenLoading = true
  if (window.auth == null) {
    window.auth = window.cloud.auth({
      persistence: 'local'
    })
  }
  window.auth.getLoginState().then(async (loginState) => {
    if (loginState && loginState.isCustomAuth) {
      window.authappid = loginState.user.customUserId
      init()
    } else {
      await window.auth.anonymousAuthProvider().signIn()
      if (window.get.auth_code != null) {
        confirmlogin()
      } else {
        window.app.fullscreenLoading = false
        window.app.donelogin = false
      }
    }
  })
}

/**
 * 获取上传的LOGO文件，并做处理
 * @param {*} e
 */
window.getLogoFile = function (e) {
  if (e.files.length !== 0) {
    const logo = e.files[0]
    if (logo.type === 'image/jpeg' || logo.type === 'image/png') {
      window.app.mess_info.pimg = getObjectURL(logo)
      window.app.mess_info.org = logo
    } else {
      window.app.$alert('请上传png或jpeg格式的图片', {
        confirmButtonText: '确定',
        type: 'warning'
      })
    }
  }
}

/**
 * 工具：获取网址中URL—GET参数
 */
function getQueryString () {
  var qs = window.location.search.substr(1)
  var args = {}
  var items = qs.length ? qs.split('&') : []
  var item = null
  var len = items.length
  for (var i = 0; i < len; i++) {
    item = items[i].split('=')
    var name = decodeURIComponent(item[0])
    var value = decodeURIComponent(item[1])
    if (name) {
      args[name] = value
    }
  }
  return args
}

/**
 * 工具：得到本地文件的显示地址
 * @param {*} file
 */
function getObjectURL (file) {
  var url = null
  if (window.createObjectURL !== undefined) {
    url = window.createObjectURL(file)
  } else if (window.URL !== undefined) {
    url = window.URL.createObjectURL(file)
  } else if (window.webkitURL !== undefined) {
    url = window.webkitURL.createObjectURL(file)
  }
  return url
}
