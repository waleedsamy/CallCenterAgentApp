'use strict';

/**
 * @ngdoc service
 * @name agentUiApp.CallCenter
 * @description
 * # CallCenter
 * Service in the agentUiApp.
 */
angular.module('agentUiApp')
  .service('CallCenter', function ($http ,$rootScope, $log, $q, localStorageService,
                                   UiService, AuthToken, API_BASE, comms) {
    var CallCenter = {};
//TODO :Use https://github.com/jmdobry/angular-cache instead
    var calls, queues;

    function _getCalls() {
      var deferred = $q.defer();
      if (calls) {
        deferred.resolve(calls);
      } else {
        $http.get(API_BASE + "/calls").then(function (result) {
          calls = result.data;
          deferred.resolve(result.data);
        }, function (error) {
          deferred.reject(error.data);
        });
      }
      return deferred.promise;
    }

    function _getCall(callid, queueid) {
      var deferred = $q.defer();
      angular.forEach(calls, function (_call) {
        if (_call.id == callid && _call.queue_id == queueid) {
          deferred.resolve(_call);
        }
      });
      return deferred.promise;
    }

    CallCenter.getAvailableCalls = function () {
      // moved to separate function , to call it from #getCallDetail
      return _getCalls();
    };

    CallCenter.getCallDetail = function (queueid, callid) {
      var deferred = $q.defer();
      if (!calls) {
        return _getCalls().then(function () {
          return _getCall(callid, queueid);
        });
      }
      return _getCall(callid, queueid);
    };

    CallCenter.getQueues = function () {
      var deferred = $q.defer();
      if (queues) {
        deferred.resolve(queues);
      } else {
        $http.get(API_BASE + "/queues").then(function (result) {
          queues = result.data;
          deferred.resolve(result.data);
        }, function (error) {
          deferred.reject(error.data);
        });
      }
      return deferred.promise;
    };

    CallCenter.getMeCall = function (qid, qslug) {
      var deferred = $q.defer();
      $http.get(API_BASE + "/call/" + qid + "/" + qslug)
        .then(function success(res) {
          // return your call client detail
          // wait your phone ring
          // answer
          // wait to your client to get connected
          return deferred.resolve(res.data);
        }, function error(err) {
          // TODO : handl error cases of not correctly change call to SUCCESSFUL state , so agent stucked in ' you already has call'
          deferred.reject(err.data);
        });
      return deferred.promise;
    };

    CallCenter.hangup = function(){
      var deferred = $q.defer();
      $http.post(API_BASE + "/call/done")
        .then(function success(res) {
          if(res.status == 200){
            UiService.info(res.message);
          }else{
            UiService.error(res.message);
          }
        }, function error(err) {
          deferred.reject(err.data);
        });
      return deferred.promise;
    }

    // generate dynamic topic layout for socket to subscribe
    var payload = AuthToken.payload();
    if (payload && payload.per && payload.per.notify) {
      for (var prev in payload.per.notify) {
        if (prev == "system") {
          angular.forEach(payload.per.notify["system"], function (item) {
            comms.subscribe(item, function (topic, result) {
              // There is No System wide events yet
              UiService.info(prev + " : " + topic + " : " + result.message);
            });
          });
        }
        if (prev == "api") {
          angular.forEach(payload.per.notify["api"], function (item) {
            var topicLayout = AuthToken.payload().lic + ":" + item
            comms.subscribe(topicLayout, function (topic, result) {
              if (item == "calls:updated") {
                Array.prototype.unshift.apply(calls, result.calls);
                $rootScope.$broadcast("calls:updated", calls);
                UiService.ok(" new calls available ");
              }
              if (item == "queues:updated") {
                Array.prototype.unshift.apply(queues, result.queues);
                $rootScope.$broadcast("queues:updated", queues);
                UiService.ok(" new queues available ");
              }
            });
          });
        }
        if (prev == "agent") {
          angular.forEach(payload.per.notify["agent"], function (item) {
            var topicLayout = AuthToken.payload().lic + ":" + item + ":" + AuthToken.payload().username;
            comms.subscribe(topicLayout, function (topic, result) {
              if (item == "call:ringing") {
                UiService.info(result.message);
              }
              if (item == "call:complete") {
                UiService.ok(result.message);
              }
              if (item == "call:problem") {
                UiService.error(result.message);
              }
            });
          });
        }
      }
    }
    return CallCenter;
  }
);
