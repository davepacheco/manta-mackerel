/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

// These are not really needed, but javascriptlint will complain otherwise:
var jobrunner;
var keygen;
var manta;
var mackerel;
var fs;

var VERSION = '0.1.2';
/*
 * params:
 * assets
 * jobManifest
 * keygen
 * keygenArgs
 * [monitorBackoff]
 * [logOpts]
 *
 */

function createJob(job, cb) {
        var log;
        var configPath = '/opt/smartdc/common/etc/config.json';
        var f = fs.readFileSync(configPath, 'utf8');
        if (job.params.logOpts) {
                log = job.log.child(job.params.logOpts);
        } else {
                log = job.log;
        }
        job.mantaConfig = JSON.parse(f).manta;

        var client = manta.createClient(job.mantaConfig);

        mackerel.jobrunner.createJob({
                jobManifest: job.params.jobManifest,
                log: log,
                client: client
        }, function callback(err, jobPath) {
                client.close();
                job.jobPath = jobPath;
                cb(err);
        });
}

function addInputKeys(job, cb) {
        var log;
        if (job.params.logOpts) {
                log = job.log.child(job.params.logOpts);
        } else {
                log = job.log;
        }

        var client = manta.createClient(job.mantaConfig);

        var keygenerator = mackerel[job.params.keygen].keygen({
                client: client,
                log: log,
                args: job.params.keygenArgs
        });

        mackerel.jobrunner.addInputKeys({
                keygen: keygenerator,
                jobPath: job.jobPath,
                log: log,
                client: client
        }, function callback(err) {
                client.close();
                cb(err);
        });
}

function addKeysFallback(err, job, cb) {
        var log;
        if (job.params.logOpts) {
                log = job.log.child(job.params.logOpts);
        } else {
                log = job.log;
        }

        log.warn({err: err}, 'fallback, ending job');

        var client = manta.createClient(job.mantaConfig);

        mackerel.jobrunner.endJobInput({
                jobPath: job.jobPath,
                log: log,
                client: client
        }, function callback(e) {
                client.close();

                if (e) {
                        cb(e);
                        return;
                }

                // this fallback does not resolve the problem, only mitigates
                // side effects, so callback with an error here to trigger the
                // workflow error branch
                cb('Error adding keys');
        });
}


function endJobInput(job, cb) {
        var log;
        if (job.params.logOpts) {
                log = job.log.child(job.params.logOpts);
        } else {
                log = job.log;
        }

        var client = manta.createClient(job.mantaConfig);

        mackerel.jobrunner.endJobInput({
                jobPath: job.jobPath,
                log: log,
                client: client
        }, function callback(err) {
                client.close();
                cb(err);
        });
}


function monitorJob(job, cb) {
        var log;
        if (job.params.logOpts) {
                log = job.log.child(job.params.logOpts);
        } else {
                log = job.log;
        }

        var client = manta.createClient(job.mantaConfig);

        mackerel.jobrunner.monitorJob({
                monitorBackoff: job.params.monitorBackoff,
                jobPath: job.jobPath,
                log: log,
                client: client
        }, function callback(err) {
                client.close();
                cb(err);
        });
}

function getResults(job, cb) {
        var log;
        if (job.params.logOpts) {
                log = job.log.child(job.params.logOpts);
        } else {
                log = job.log;
        }

        var client = manta.createClient(job.mantaConfig);

        mackerel.jobrunner.getResults({
                jobPath: job.jobPath,
                log: log,
                client: client
        }, function callback(err, res) {
                client.close();
                if (err) {
                        cb(err);
                        return;
                }
                job.jobResults = res;

                if (res.errors.length > 0 || res.failures.length > 0) {
                        cb({err: 'Errors from job.',
                            errors: res.errors,
                            failures: res.failures});
                        return;
                }

                log.info(res);
                cb(err, res);
        });
}

function makeLink(job, cb) {
        var log;
        if (job.params.logOpts) {
                log = job.log.child(job.params.logOpts);
        } else {
                log = job.log;
        }

        var client = manta.createClient(job.mantaConfig);

        client.ln(job.jobResults.outputs[0], job.params.linkPath,
                function (err) {

                client.close();
                if (err) {
                        log.warn(err);
                        cb(err);
                        return;
                }

                log.info('Link created ' + job.params.linkPath + ' -> ' +
                        job.jobResults.outputs[0]);
                cb();
        });
}

function onerror(job, cb) {
        var log;
        if (job.params.logOpts) {
                log = job.log.child(job.params.logOpts);
        } else {
                log = job.log;
        }

        log.warn({chain_results: job.chain_results});

        cb('retry');
}

var workflow = {
        name: 'runjob-' + VERSION,
        version: VERSION,
        chain: [ {
                name: 'Create Job',
                timeout: 10,
                retry: 3,
                body: createJob
        }, {
                name: 'Add Input Keys',
                timeout: 60,
                retry: 1, // 1 retry because we don't want keys duplicated
                body: addInputKeys,
                fallback: addKeysFallback
        }, {
                name: 'End Job Input',
                timeout: 10,
                retry: 3,
                body: endJobInput
        }, {
                name: 'Monitor Job',
                timeout: 3600,
                retry: 1, // retry built in to the function
                body: monitorJob
        }, {
                name: 'Get Results',
                timeout: 30,
                retry: 3,
                body: getResults
        }, {
                name: 'Make Link',
                timeout: 10,
                retry: 3,
                body: makeLink
        } ],
        onerror: [ {
                name: 'On Error',
                timeout: 60,
                retry: 1,
                body: onerror
        } ],
        max_attempts: 5,
        initial_delay: 10000,
        max_delay: 180000
};

module.exports = workflow;
