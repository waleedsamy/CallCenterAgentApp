'use strict';

/**
 * @ngdoc service
 * @name agentUiApp.rtmp
 * @description
 * # rtmp
 * Service in the agentUiApp.
 */
angular.module('agentUiApp')
  .service('rtmp', function ($rootScope, $window, AuthToken, FS_RTMP, $timeout, UiService , moment ,
    _ , MAKE_CALL_DONE , AGENT_ANSWER_TIMEOUT) {
    var fsrtmp;
    var currentCall = {};
    var allCalls = [];
    var rtmpSession;
    //[connected , disconnected , connecting]
    var rtmpSessionStatus;
    var sessionUser;

    var payload;

    function fsLogin() {
      console.log("fsLogin");
      payload = AuthToken.payload();
      if (!fsrtmp) {
        fsrtmp = angular.element(document.querySelector("#flashPhone"))[0];
        console.log("hack to get fsrtmp and it is" + fsrtmp);
      }
      if (fsrtmp && payload && payload.sip && payload.sip.num && payload.sip.cred) {
        fsrtmp.login(payload.sip.num, payload.sip.cred);
      } else {
        $rootScope.$broadcast("rtmp:problem", {
          message: "un able to login , no credentials or flash not loaded",
          level: 3
        });
        UiService.error("un able to login , no credentials or flash not loaded");
        console.log("fsrtmp " + fsrtmp);
        console.log("payload " + payload);
      }
    }

    function fsLogout() {
      if (fsrtmp) {
        fsrtmp.logout(sessionUser);
      }
    }

    function fsAnswer() {
      if (currentCall && fsrtmp) {
        fsrtmp.answer(currentCall.uuid);
      }
    }

    function fsHangup() {
      console.log(' hangup from rtmp all object is ***' + JSON.stringify(currentCall));
      if (currentCall && currentCall.uuid) {
        console.log(' hangup from rtmp ***' + currentCall.uuid);
        fsrtmp.hangup(currentCall.uuid);
        checkCallStatus();
      }else{
        console.log('NO UUID');
        checkCallStatus();
      }
    }

    function fsRegister() {
      if (fsrtmp) {
        fsrtmp.register(sessionUser, "");
      }
    }

    function fsConnect() {
      if (fsrtmp) {
        fsrtmp.connect();
      }
    }

    // this method called after agent hangup call or
    // client hangup call ' detected by "Closing media streams" message in onDebug'
    function checkCallStatus(){
      var now = moment();
      var startMoment = currentCall.start || now ;
      var endMoment = currentCall.end || now ;
      var callDuration = currentCall.duration =  endMoment.diff(startMoment,'seconds');

      // mark this call processed if
      //  call stay more than MAKE_CALL_DONE

      console.log("call will be short if callDuration is less than " +MAKE_CALL_DONE + " seconds and it is "+callDuration)  ;
      if(callDuration > MAKE_CALL_DONE){
        console.log('call done ');
        $rootScope.$broadcast("rtmp:call:hangup",
          {session: rtmpSession, uuid: currentCall.uuid , status :'done' , duration : callDuration});
      } else {
        console.log('call retry ');
        $rootScope.$broadcast("rtmp:call:hangup",
          {session: rtmpSession, uuid: currentCall.uuid , status :'retry' ,
          duration : callDuration , error : 'call is short than ' + MAKE_CALL_DONE + ' seconds'});
      }
      currentCall = {};

    }

    $window.onConnected = function (sessionid) {
      console.log("onConnected " + sessionid);
      rtmpSession = sessionid;
      rtmpSessionStatus = "connected";
      $rootScope.$broadcast("rtmp:state", {session: rtmpSession, status: rtmpSessionStatus, level: 3});
      UiService.info("successfully connected to communication server");

      if (AuthToken.isAuthenticated()) {
        fsLogin();
      }
    };

    $window.onDisconnected = function () {
      rtmpSessionStatus = "disconnected";
      $rootScope.$broadcast("rtmp:state", {session: rtmpSession, status: rtmpSessionStatus, level: 1});
      UiService.info("take a rest , we try to connect you back to server");
      //TODO : what happen to current call when agent disconnected , what strategy to fall over ?
      $timeout(function () {
        rtmpSessionStatus = "connecting";
        $rootScope.$broadcast("rtmp:state", {session: rtmpSession, status: rtmpSessionStatus, level: 3});
        UiService.info("try to connect you back to serve");
        fsConnect();
      }, 5000);
    };


    $window.onLogin = function (status, user, domain) {
      $rootScope.$broadcast("rtmp:state:login", {
        session: rtmpSession, status: status,
        user: user, domain: domain
      });
      if (status == "success") {
        sessionUser = user + '@' + domain;
        fsRegister();
        // what to broadcast here ?
      }
    };

    $window.onIncomingCall = function (uuid, name, number, account, evt) {
      $rootScope.$broadcast("rtmp:call", {uuid: uuid, name: name, number: number, account: account, level: 3});
      currentCall = {};
      currentCall.uuid = uuid;
      currentCall.name = name;
      currentCall.number = number;
      currentCall.account = account;
      currentCall.log = [];
      currentCall.start = currentCall.end = currentCall.duration = null;
      currentCall.started = false;
      allCalls.push(currentCall);
      UiService.info("call " + uuid + " from " + name || " Unknown");
    };

    $window.onDebug = function (message) {
      $rootScope.$broadcast("rtmp:debug", {message: message, level: 5});
      currentCall.log.push(message);
      if( message == 'netStatus: NetStream.Buffer.Full' && !currentCall.started ){
        currentCall.start = moment();
        currentCall.started = true;
      }
      if (message == "Closing media streams") {
        currentCall.end = moment();
        checkCallStatus();
      }
    };

    $window.fsFlashLoaded = function (evt) {
      console.log("fsFlashLoaded");
      if (evt.success) {

        fsrtmp = angular.element(document.querySelector("#" + evt.id))[0];
        console.log("fsrtmp after flash loaded is " + fsrtmp);
        // not define onConnected until fsFlashLoaded called to prevent calling onConnect first


      } else {
        $window.onConnected = null;
        $window.onDisconnected = null;
        $rootScope.$broadcast("rtmp:problem", {message: "flash fail in loading", level: 1});
        UiService.error({message: "flash fail in loading , please reload page", level: 1});
      }
    };

    return {
      rtmpVars: {rtmp_url: FS_RTMP},
      rtmpParams: {allowScriptAccess: 'always'},
      onFSLoaded: $window.fsFlashLoaded,
      logout: fsLogout,
      answer: fsAnswer,
      hangup: fsHangup,
      me: function () {
        if (!sessionUser) {
          sessionUser = AuthToken.payload().sip.num;
        }
        return rtmpSession + "/" + sessionUser
      }
    }
  }
)
;
