var jsPsychExternalHtml = (function (jspsych) {
  'use strict';

  const info = {
      name: "external-html",
      parameters: {
          /** The url of the external html page */
          url: {
              type: jspsych.ParameterType.STRING,
              pretty_name: "URL",
              default: undefined,
          },
          /** The key to continue to the next page. */
          cont_key: {
              type: jspsych.ParameterType.KEY,
              pretty_name: "Continue key",
              default: null,
          },
          /** The button to continue to the next page. */
          cont_btn: {
              type: jspsych.ParameterType.STRING,
              pretty_name: "Continue button",
              default: null,
          },
          /** Function to check whether user is allowed to continue after clicking cont_key or clicking cont_btn */
          check_fn: {
              type: jspsych.ParameterType.FUNCTION,
              pretty_name: "Check function",
              default: () => true,
          },
          /** Whether or not to force a page refresh. */
          force_refresh: {
              type: jspsych.ParameterType.BOOL,
              pretty_name: "Force refresh",
              default: false,
          },
          /** If execute_Script == true, then all JavasScript code on the external page will be executed. */
          execute_script: {
              type: jspsych.ParameterType.BOOL,
              pretty_name: "Execute scripts",
              default: false,
          },
      },
  };
  /**
   * **external-html**
   *
   * jsPsych plugin to load and display an external html page. To proceed to the next trial, the
   * user might either press a button on the page or a specific key. Afterwards, the page will be hidden and
   * the experiment will continue.
   *
   * @author Erik Weitnauer
   * @see {@link https://www.jspsych.org/plugins/jspsych-external-html/ external-html plugin documentation on jspsych.org}
   */
  class ExternalHtmlPlugin {
      constructor(jsPsych) {
          this.jsPsych = jsPsych;
      }
      trial(display_element, trial, on_load) {
          // hold the .resolve() function from the Promise that ends the trial
          let trial_complete;
          var url = trial.url;
          if (trial.force_refresh) {
              url = trial.url + "?t=" + performance.now();
          }

          const setupLoadedHtml = (html) => {
              display_element.innerHTML = html;
              on_load();
              var t0 = performance.now();
              const key_listener = (e) => {
                  if (this.jsPsych.pluginAPI.compareKeys(e.key, trial.cont_key)) {
                      finish();
                  }
              };
              const finish = () => {
                  if (trial.check_fn && !trial.check_fn(display_element)) {
                      return;
                  }
                  if (trial.cont_key) {
                      display_element.removeEventListener("keydown", key_listener);
                  }
                  var trial_data = {
                      rt: Math.round(performance.now() - t0),
                      url: trial.url,
                  };
                  display_element.innerHTML = "";
                  this.jsPsych.finishTrial(trial_data);
                  trial_complete();
              };
              // by default, scripts on the external page are not executed with XMLHttpRequest().
              // To activate their content through DOM manipulation, we need to relocate all script tags
              if (trial.execute_script) {
                  var all_scripts = display_element.getElementsByTagName("script");
                  for (var i = 0; i < all_scripts.length; i++) {
                      const relocatedScript = document.createElement("script");
                      const curr_script = all_scripts[i];
                      relocatedScript.text = curr_script.text;
                      curr_script.parentNode.replaceChild(relocatedScript, curr_script);
                  }
              }
              if (trial.cont_btn) {
                  const btn = display_element.querySelector("#" + trial.cont_btn);
                  if (btn) {
                      btn.addEventListener("click", finish);
                  } else {
                      console.error(`plugin-external-html: continue button #${trial.cont_btn} not found.`);
                  }
              }
              if (trial.cont_key) {
                  display_element.addEventListener("keydown", key_listener);
              }
          };

          const showLoadError = (err) => {
              console.error(`Something went wrong loading external HTML in plugin-external-html.`, err);
              display_element.innerHTML =
                  `<div style="margin:2em; text-align:center;">
                    <p><strong>Could not load the consent page.</strong></p>
                    <p>If you opened this study as a local file, try serving the folder over HTTP<br>
                    (for example: <code>python3 -m http.server</code>) and reload.</p>
                    <p style="color:#666; font-size:0.9em;">${String(err && err.message ? err.message : err)}</p>
                  </div>`;
              if (typeof on_load === "function") on_load();
          };

          const loadViaXHR = () => new Promise((resolve, reject) => {
              var xmlhttp = new XMLHttpRequest();
              xmlhttp.open("GET", url, true);
              xmlhttp.onload = () => {
                  // status 0 is normal for successful file:// loads
                  if (xmlhttp.status === 200 || xmlhttp.status === 0) {
                      resolve(xmlhttp.responseText);
                  } else {
                      reject(new Error(`XHR failed with status ${xmlhttp.status}`));
                  }
              };
              xmlhttp.onerror = () => reject(new Error("XHR network error"));
              xmlhttp.send();
          });

          const loadHtml = () => {
              // fetch() is blocked for local file:// pages in most browsers
              if (window.location.protocol === "file:") {
                  return loadViaXHR();
              }
              return fetch(url)
                  .then((response) => {
                      if (!response.ok) {
                          throw new Error(`fetch failed with status ${response.status}`);
                      }
                      return response.text();
                  })
                  .catch((err) => {
                      console.warn(`fetch() failed in plugin-external-html; trying XHR.`, err);
                      return loadViaXHR();
                  });
          };

          loadHtml()
              .then(setupLoadedHtml)
              .catch(showLoadError);

          return new Promise((resolve) => {
              trial_complete = resolve;
          });
      }
      simulate(trial, simulation_mode, simulation_options, load_callback) {
          if (simulation_mode == "data-only") {
              load_callback();
              this.simulate_data_only(trial, simulation_options);
          }
          if (simulation_mode == "visual") {
              this.simulate_visual(trial, simulation_options, load_callback);
          }
      }
      create_simulation_data(trial, simulation_options) {
          const default_data = {
              url: trial.url,
              rt: this.jsPsych.randomization.sampleExGaussian(2000, 200, 1 / 200, true),
          };
          const data = this.jsPsych.pluginAPI.mergeSimulationData(default_data, simulation_options);
          this.jsPsych.pluginAPI.ensureSimulationDataConsistency(trial, data);
          return data;
      }
      simulate_data_only(trial, simulation_options) {
          const data = this.create_simulation_data(trial, simulation_options);
          this.jsPsych.finishTrial(data);
      }
      simulate_visual(trial, simulation_options, load_callback) {
          const data = this.create_simulation_data(trial, simulation_options);
          const display_element = this.jsPsych.getDisplayElement();
          this.trial(display_element, trial, () => {
              load_callback();
              if (trial.cont_key) {
                  this.jsPsych.pluginAPI.pressKey(trial.cont_key, data.rt);
              }
              else if (trial.cont_btn) {
                  this.jsPsych.pluginAPI.clickTarget(display_element.querySelector("#" + trial.cont_btn), data.rt);
              }
          });
      }
  }
  ExternalHtmlPlugin.info = info;

  return ExternalHtmlPlugin;

})(jsPsychModule);
