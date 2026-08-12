var jsPsychCanvasButtonResponse = (function (jspsych) {
  'use strict';

  const info = {
      name: "canvas-button-response",
      parameters: {
          /** The drawing function to apply to the canvas. Should take the canvas object as argument. */
          stimulus: {
              type: jspsych.ParameterType.FUNCTION,
              pretty_name: "Stimulus",
              default: undefined,
          },
          /** Any content here will be displayed under the button. */
          prompt: {
              type: jspsych.ParameterType.HTML_STRING,
              pretty_name: "Prompt",
              default: null,
          },
          /** How long to hide the stimulus. */
          stimulus_duration: {
              type: jspsych.ParameterType.INT,
              pretty_name: "Stimulus duration",
              default: null,
          },
          /** How long to show the trial. */
          trial_duration: {
              type: jspsych.ParameterType.INT,
              pretty_name: "Trial duration",
              default: null,
          },
          /** The vertical margin of the button. */
          margin_vertical: {
              type: jspsych.ParameterType.STRING,
              pretty_name: "Margin vertical",
              default: "0px",
          },
          /** The horizontal margin of the button. */
          margin_horizontal: {
              type: jspsych.ParameterType.STRING,
              pretty_name: "Margin horizontal",
              default: "8px",
          },
          /** If true, then trial will end when user responds. */
          response_ends_trial: {
              type: jspsych.ParameterType.BOOL,
              pretty_name: "Response ends trial",
              default: true,
          },
          /** Array containing the height (first value) and width (second value) of the canvas element. */
          canvas_size: {
              type: jspsych.ParameterType.INT,
              array: true,
              pretty_name: "Canvas size",
              default: [500, 500],
          },
          /** Player's total score. */
          score: {
              type: jspsych.ParameterType.INT,
              pretty_name: "Score",
              default: 0,
          },
          /** Minimum spins before Next is enabled (ignored when equal to max_spins). */
          min_spins: {
              type: jspsych.ParameterType.INT,
              pretty_name: "Min spins",
              default: 4,
          },
          /** Maximum spins; trial auto-ends when reached. */
          max_spins: {
              type: jspsych.ParameterType.INT,
              pretty_name: "Max spins",
              default: 12,
          },
          /** If false, hide the collected-faces score board. */
          show_score_board: {
              type: jspsych.ParameterType.BOOL,
              pretty_name: "Show score board",
              default: true,
          },
          /** Where to place the prompt relative to the wheel: "below" or "above". */
          prompt_position: {
              type: jspsych.ParameterType.STRING,
              pretty_name: "Prompt position",
              default: "below",
          },
      },
  };
  /**
   * **canvas-button-response**
   *
   * jsPsych plugin for displaying a canvas stimulus and getting a button response
   *
   * @author Chris Jungerius (modified from Josh de Leeuw)
   * @see {@link https://www.jspsych.org/plugins/jspsych-canvas-button-response/ canvas-button-response plugin documentation on jspsych.org}
   */
  class CanvasButtonResponsePlugin {
      constructor(jsPsych) {
          this.jsPsych = jsPsych;
      }
      trial(display_element, trial) {
          const showScoreBoard = trial.show_score_board !== false;
          const promptAbove = trial.prompt_position === "above";
          const promptHtml = trial.prompt !== null ? trial.prompt : "";

          // create canvas
          var html =
              '<button type="button" id="spinner-round-stop" class="spinner-round-stop" hidden disabled><span class="spinner-round-stop-label">Next</span><span class="spinner-round-stop-arrow" aria-hidden="true"></span></button>' +
              (showScoreBoard
                ? '<div class="score-board">' +
                  '<div class="score-board-title">Collected Faces</div>' +
                  '<div class="score-board-faces" id="collected-faces"></div>' +
                  "</div>"
                : "") +
              (promptAbove ? promptHtml : "") +
              '<div id="jspsych-canvas-button-response-stimulus">' +
                '<div class="spinner-base" aria-hidden="true"></div>' +
                '<canvas id="jspsych-canvas-stimulus" height="' +
                trial.canvas_size[0] +
                '" width="' +
                trial.canvas_size[1] +
                '"></canvas>' +
                '<div id="spin"></div>' +
              "</div>";

          //show prompt if there is one (below wheel by default)
          if (!promptAbove && trial.prompt !== null) {
              html += trial.prompt;
          }
          display_element.innerHTML = html;

          //draw
          let c = document.getElementById("jspsych-canvas-stimulus");
          const stopBtn = document.getElementById("spinner-round-stop");
          const minSpins = trial.min_spins != null ? trial.min_spins : 4;
          const maxSpins = trial.max_spins != null ? trial.max_spins : 12;
          const hideNext = minSpins >= maxSpins;

          // store data
          let spinnerData = {
            outcomes: [],
            score: trial.score || 0,
            rt: null,
            isSpinning: false,
            cleanup: null,
            maxSpins: maxSpins,
          };
          trial.stimulus(c, spinnerData);

          // start time
          var start_time = performance.now();
          let ending = false;

          // function to end trial when it is time
          const end_trial = () => {
              if (ending) return;
              ending = true;
              if (spinnerData.cleanup) spinnerData.cleanup();
              // kill any remaining setTimeout handlers
              this.jsPsych.pluginAPI.clearAllTimeouts();
              // gather the data to store for the trial
              var trial_data = {
                  outcomes: spinnerData.outcomes,
                  score: spinnerData.score,
                  rt: spinnerData.rt,
                  n_spins: spinnerData.outcomes.length,
              };
              // clear the display
              display_element.innerHTML = "";
              // move on to the next trial
              this.jsPsych.finishTrial(trial_data);
          };
          // function to handle responses by the subject
          function after_response() {
              // measure rt
              var end_time = performance.now();
              var rt = Math.round(end_time - start_time);
              spinnerData.rt = rt;
              // after a valid response, the stimulus will have the CSS class 'responded'
              // which can be used to provide visual feedback that a response was recorded
              display_element.querySelector("#jspsych-canvas-button-response-stimulus").className +=
                  " responded";
              if (stopBtn) stopBtn.disabled = true;
              if (trial.response_ends_trial) {
                  end_trial();
              }
          }

          const tryEnableStop = () => {
              if (!stopBtn || ending) return;
              if (hideNext) {
                  stopBtn.hidden = true;
                  stopBtn.disabled = true;
                  return;
              }
              const canStop =
                  spinnerData.outcomes.length >= minSpins &&
                  !spinnerData.isSpinning;
              if (canStop) {
                  stopBtn.hidden = false;
                  stopBtn.disabled = false;
              } else if (spinnerData.outcomes.length < minSpins) {
                  stopBtn.hidden = true;
                  stopBtn.disabled = true;
              } else {
                  // min+ spins but currently spinning — keep visible, disable until idle
                  stopBtn.hidden = false;
                  stopBtn.disabled = true;
              }
          };

          // keep spacebar for spinning, not for activating Stop
          stopBtn.addEventListener("keydown", (e) => {
              if (e.code === "Space" || e.key === " ") e.preventDefault();
          });

          stopBtn.addEventListener("click", () => {
              if (stopBtn.disabled || ending || hideNext) return;
              if (spinnerData.outcomes.length < minSpins) return;
              if (spinnerData.isSpinning) return;
              stopBtn.disabled = true;
              clearInterval(waitForEnd);
              setTimeout(after_response, 300);
          });

          // end trial at max spins, update Stop button availability
          const waitForEnd = setInterval(function() {
            tryEnableStop();
            if (spinnerData.outcomes.length >= maxSpins && !spinnerData.isSpinning) {
              clearInterval(waitForEnd);
              stopBtn.disabled = true;
              setTimeout(after_response, 1000);
            }
          }, 100);
          // hide image if timing is set
          if (trial.stimulus_duration !== null) {
              this.jsPsych.pluginAPI.setTimeout(() => {
                  display_element.querySelector("#jspsych-canvas-button-response-stimulus").style.visibility = "hidden";
              }, trial.stimulus_duration);
          }
          // end trial if time limit is set
          if (trial.trial_duration !== null) {
              this.jsPsych.pluginAPI.setTimeout(() => {
                  end_trial();
              }, trial.trial_duration);
          }
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
              rt: this.jsPsych.randomization.sampleExGaussian(500, 50, 1 / 150, true),
              response: this.jsPsych.randomization.randomInt(0, trial.choices.length - 1),
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
          this.trial(display_element, trial);
          load_callback();
          if (data.rt !== null) {
              this.jsPsych.pluginAPI.clickTarget(display_element.querySelector(`div[data-choice="${data.response}"] button`), data.rt);
          }
      }
  }
  CanvasButtonResponsePlugin.info = info;

  return CanvasButtonResponsePlugin;

})(jsPsychModule);
