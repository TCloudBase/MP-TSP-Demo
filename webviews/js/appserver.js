/**
 * 获取应用基本信息，并转换图片地址格式
 */
window.app_getInfo = async function () {
  const dataResult = await callSV('get_appinfo')
  if (dataResult.data != null) {
    if (dataResult.data.img.indexOf('cloud://') !== -1) dataResult.data.pimg = await cloudtohttp(dataResult.data.img)
    else dataResult.data.pimg = '' + dataResult.data.img
    if (dataResult.data.appcode != null) dataResult.data.pappcode = await cloudtohttp(dataResult.data.appcode)
  }
  return dataResult
}

/**
 * 保存应用基本信息，对新图片上传覆盖更新
 * @param {*} data
 */
window.app_saveInfo = async function (data) {
  console.log(data)
  let { des, img, name } = data
  if (data.org != null) {
    try {
      const logoResult = await window.cloud.uploadFile({
        cloudPath: `appinfo/${window.authappid}.${data.org.name.slice(data.org.name.lastIndexOf('.') + 1)}`,
        filePath: data.org
      })
      img = logoResult.fileID
    } catch (e) {
      window.app.$notify.error({
        title: 'LOGO图片上传异常',
        message: e,
        duration: 0
      })
    }
  }
  const dataResult = await callSV('save_appinfo', { des, img, name })
  if (dataResult.msg != null) {
    window.app.$notify.error({
      title: '信息保存失败，请再次尝试！',
      message: dataResult.msg,
      duration: 0
    })
    window.app.deploybtn_load = false
    return Promise.reject(new Error(dataResult.msg))
  } else {
    console.log(dataResult)
    window.app.$message({
      message: '信息保存成功！',
      type: 'success'
    })
  }
}

/**
 * 启动应用部署步骤
 */
window.depoly_start = async function () {
  if (window.app.func_list[18] != null && window.app.func_list[49] != null) {
    window.app.deploy_load = true
    window.app.deploy_step = 0
    const checkState = await window.depoly_item('com_checkState')
    if (checkState.result == null) {
      window.app.deploy_step = 1
      await window.depoly_item('com_createEnv')
    }
    window.app.deploy_step = 2
    const deploytcb = await window.depoly_item('com_deploytcb')
    console.log(deploytcb)
    window.app.deploy_step = 3
    const deployapp = await window.depoly_item('com_deployapp')
    window.deploycode = deployapp.result
    window.app.deploy_step = 4
    if (window.app.func_list[19] != null) {
      await window.depoly_item('open_mess')
      await window.start_mess()
    }
    window.location.reload()
  } else {
    window.app.$notify.error({
      title: '你的当前授权无法部署应用！',
      message: '请重新登录修改授权集,保证应用开发权限和云开发权限顺利授权',
      duration: 0
    })
  }
}

/**
 * 部署子项执行，如果后台报错自动终止部署步骤
 * @param {*} type
 */
window.depoly_item = async function (type) {
  const res = await callSV(type)
  if (res.msg != null) {
    console.log(res.msg)
    window.app.$notify.error({
      title: '部署服务出现异常，请重新尝试！',
      message: res.msg,
      duration: 0
    })
    window.app.deploy_load = false
    return Promise.reject(new Error(res.msg))
  }
  return res
}

/**
 * 接入客服消息，创建可监听的数据
 */
window.start_mess = async function () {
  const messChat = await window.cloud.database().collection('mess').doc(window.authappid).get()
  if (messChat.data.length === 0) {
    await window.cloud.database().collection('mess').add({
      _id: window.authappid,
      chat_list: {},
      renew_list: {}
    })
  }
}

/**
 * 监听客服数据源，不管有无接入
 */
window.chat_watch = async function () {
  await window.cloud.database().collection('mess').doc(window.authappid).watch({
    onChange: async (res) => {
      if (res.docs.length !== 0) {
        window.chat_temp_mess_list = res.docs[0]
        await window.chat_watchExcute()
        await window.chat_watchOpen(null, true)
      }
    },
    onError (e) {
      window.app.$notify.error({
        title: '客服消息接入系统异常，请刷新页面重试',
        message: e,
        duration: 0
      })
    }
  })
}

/**
 * 监听客服消息后，请求消息用户的基本信息，并装载
 */
window.chat_watchExcute = async function () {
  const noopenid = []
  let okopenid = window.localStorage.getItem('mess_userinfo')
  okopenid = (okopenid === '' || okopenid == null ? {} : JSON.parse(okopenid))
  for (const id in window.chat_temp_mess_list.chat_list) {
    if (okopenid[id] == null) {
      noopenid.push(id)
    }
  }
  if (noopenid.length !== 0) {
    const res = await callSV('get_userInfo', {
      openid: noopenid
    })
    if (res.result) {
      for (const i in res.result) {
        const tempUserinfo = JSON.parse(res.result[i])
        okopenid[tempUserinfo._id] = {
          avatarUrl: tempUserinfo.avatarUrl,
          nickName: tempUserinfo.nickName
        }
      }
      window.localStorage.setItem('mess_userinfo', JSON.stringify(okopenid))
    }
    if (res.msg) {
      window.app.$notify.error({
        title: '客服消息接入系统异常，请尝试重试',
        message: res.msg,
        duration: 0
      })
    }
  }
  window.app.openid_userinfo = okopenid
}

/**
 * 处理监听的客服消息，转换图片格式，统计未读数
 * @param {*} openid
 * @param {*} mess
 */
window.chat_watchOpen = async function (openid = null, mess = false) {
  if (mess === true) {
    let tempchat = window.chat_temp_mess_list.chat_list
    let temprenew = window.chat_temp_mess_list.renew_list
    temprenew = temprenew == null ? {} : temprenew
    tempchat = tempchat == null ? {} : tempchat
    const outtime = {}
    for (const id in tempchat) {
      const time = temprenew[id] == null ? 0 : temprenew[id]
      let cishu = 0
      for (const item in tempchat[id]) {
        const tempitem = tempchat[id][item]
        if (tempitem.time > time && tempitem.owner !== true) {
          cishu++
        }
        if (tempitem.type === 'image') {
          tempchat[id][item].content = cloudtohttps(tempchat[id][item].content)
        }
      }
      outtime[id] = cishu
    }
    window.app.chat_mess_list = tempchat
    window.app.chat_mess_out = outtime
  }
  const chatOpenidlist = Object.keys(window.app.chat_mess_list)
  if (openid != null) {
    window.app.chat_model_openid = openid
  } else {
    if (document.body.clientWidth >= 800 && chatOpenidlist.length !== 0) {
      if (window.app.chat_model_openid == null) {
        window.app.chat_model_openid = chatOpenidlist[0]
      }
    }
  }
  setTimeout(function () {
    const chatel = document.getElementById('chat_list')
    chatel.scrollTop = chatel.scrollHeight
  }, 100)
}

/**
 * 发送客服消息，自动判断用户
 */
window.chat_send = async function () {
  const time = parseInt((new Date().getTime()) / 1000)
  if (window.app.chat_input_mess !== '') {
    const res = await callSV('send_custommess', {
      openid: window.app.chat_model_openid,
      text: window.app.chat_input_mess
    })
    if (res.result) {
      const db = window.cloud.database()
      await db.collection('mess').doc(window.authappid).update({
        chat_list: {
          [window.app.chat_model_openid]: db.command.push([{
            time: time,
            type: 'text',
            owner: true,
            content: window.app.chat_input_mess
          }])
        }
      })
      window.app.chat_input_mess = ''
    }
    if (res.msg != null) {
      console.log(res.msg)
      window.app.$notify.error({
        title: '客服消息发送服务出错，请重新尝试！',
        message: res.msg,
        duration: 0
      })
      return Promise.reject(new Error(res.msg))
    }
  }
}

/**
 * 设置已读，配置当前时间
 */
window.setOutTime = function () {
  if (window.app.chat_mess_out[window.app.chat_model_openid] !== 0) {
    window.cloud.database().collection('mess').doc(window.authappid).update({
      renew_list: {
        [window.app.chat_model_openid]: parseInt((new Date().getTime()) / 1000)
      }
    })
  }
}

/**
 * 第三方平台服务应用API函数
 * @param {*} type
 */
function callSV (type, data = {}) {
  return new Promise((resolve, reject) => {
    window.cloud.callFunction({
      name: 'component_server',
      data: {
        type,
        data
      }
    }).then((res) => {
      resolve(res.result)
    }).catch(e => {
      reject(e)
      console.log(e)
      window.app.$notify.error({
        title: '第三方平台服务异常',
        message: e,
        duration: 0
      })
    })
  })
}

/**
 * 工具：将云存储FILEID转换为http【正常请求】
 * @param {*} src
 */
async function cloudtohttp (src) {
  const urlResult = await window.cloud.getTempFileURL({ fileList: [src] })
  return urlResult.fileList[0].tempFileURL
}

/**
 * 工具：将云存储FILEID转换为http【全读转换】
 * @param {*} src
 */
function cloudtohttps (src) {
  if (src === '') {
    return ''
  }
  const first = src.indexOf('.')
  const end = src.indexOf('/', first)
  return 'https://' + src.slice(first + 1, end) + '.tcb.qcloud.la/' + src.slice(end + 1, src.length)
}
