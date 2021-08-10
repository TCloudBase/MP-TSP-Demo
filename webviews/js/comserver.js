/**
 * 获取预授权URL,并做跳转
 */
window.getPreurl = async function () {
  const preurlData = await callCS('preauth_url')
  if (preurlData.url != null) {
    console.log(preurlData)
    window.location.href = preurlData.url
  } else {
    this.$message.error(preurlData.msg)
  }
}

/**
 * 获取登录APPID的授权状态
 */
window.getAuthorizer = async function () {
  return await callCS('authorizer_states')
}

/**
 * 确认登录code是否正确
 */
window.confirmAuth = async function () {
  return await callCS('confirm_auth')
}

/**
 * 第三方平台服务基础API函数
 * @param {*} type
 */
function callCS (type) {
  return new Promise((resolve, reject) => {
    window.cloud.callFunction({
      name: 'component_server',
      data: {
        type: type,
        code: window.get.auth_code,
        appid: window.authappid
      }
    }).then((res) => {
      resolve(res.result)
    }).catch(e => {
      reject(e)
      window.app.$notify.error({
        title: '第三方平台服务异常',
        message: JSON.stringify(e),
        duration: 0
      })
    })
  })
}
