# Exploratory: which gaze summaries track same-round flow?
# Writes flow_gaze_eda.json next to this script.

suppressPackageStartupMessages({
  library(tidyverse)
  library(jsonlite)
})

WHEEL_LEVELS <- c("all1", "low", "medium", "high", "half51", "all5")

finite_mean <- function(x) {
  x <- x[is.finite(x)]
  if (!length(x)) NA_real_ else mean(x)
}
finite_med <- function(x) {
  x <- x[is.finite(x)]
  if (!length(x)) NA_real_ else median(x)
}
finite_sd <- function(x) {
  x <- x[is.finite(x)]
  if (length(x) < 2) NA_real_ else sd(x)
}

# Blink events with hysteresis: the eye closes when `score` passes close_at and
# reopens when it passes back beyond open_at (below = TRUE flips the direction,
# for EAR). Events count only if they last min_ms–max_ms; longer closures are
# looking down / eye rubbing. A gap > max_dt or face loss ends an episode
# without counting it. Rate = events per second of valid tracking time.
detect_blinks <- function(t, score, face_ok, close_at, open_at, below = FALSE,
                          min_ms = 50, max_ms = 500, max_dt = 200) {
  n <- length(t)
  closed_state <- rep(NA, n)
  if (n < 3) return(list(n = 0L, valid_s = NA_real_, rate = NA_real_, closed = closed_state))
  o <- order(t)
  tt <- t[o]
  sc <- score[o]
  valid <- is.finite(tt) & is.finite(sc) & !is.na(face_ok[o]) & face_ok[o] == 1
  is_closing <- function(x) if (below) x <= close_at else x >= close_at
  is_opening <- function(x) if (below) x >= open_at else x <= open_at

  events <- 0L
  valid_ms <- 0
  closed <- FALSE
  # after a gap or face loss, wait for an open eye before a closure can start
  armed <- FALSE
  start <- NA_real_
  prev_t <- NA_real_
  state <- rep(NA, n)
  for (i in seq_len(n)) {
    if (!valid[i]) {
      closed <- FALSE
      armed <- FALSE
      prev_t <- NA_real_
      next
    }
    dt <- if (is.finite(prev_t)) tt[i] - prev_t else NA_real_
    if (is.finite(dt) && dt <= max_dt) valid_ms <- valid_ms + dt
    if (is.finite(dt) && dt > max_dt) {
      closed <- FALSE
      armed <- FALSE
    }
    if (!armed) {
      if (is_opening(sc[i])) armed <- TRUE
      state[i] <- if (armed) FALSE else NA
      prev_t <- tt[i]
      next
    }
    if (!closed && is_closing(sc[i])) {
      closed <- TRUE
      start <- tt[i]
    } else if (closed && is_opening(sc[i])) {
      dur <- tt[i] - start
      if (dur >= min_ms && dur <= max_ms) events <- events + 1L
      closed <- FALSE
    }
    state[i] <- closed
    prev_t <- tt[i]
  }
  closed_state[o] <- state
  valid_s <- valid_ms / 1000
  list(
    n = events,
    valid_s = valid_s,
    rate = if (valid_s > 0) events / valid_s else NA_real_,
    closed = closed_state
  )
}

cohen_kappa <- function(a, b) {
  ok <- !is.na(a) & !is.na(b)
  a <- a[ok]
  b <- b[ok]
  if (length(a) < 10) return(NA_real_)
  po <- mean(a == b)
  pe <- mean(a) * mean(b) + mean(!a) * mean(!b)
  if (pe >= 1) NA_real_ else (po - pe) / (1 - pe)
}

# I-DT (Salvucci & Goldberg): expand a window while
# (max x − min x) + (max y − min y) ≤ D and duration ≥ min_ms.
idt_fixations <- function(x, y, t, xn = NULL, yn = NULL, D = 48, min_ms = 100) {
  empty <- tibble(
    cx = numeric(), cy = numeric(), nx = numeric(), ny = numeric(),
    t0 = numeric(), t1 = numeric(), dur = numeric(), disp = numeric()
  )
  ok <- is.finite(x) & is.finite(y) & is.finite(t)
  if (!is.null(xn)) ok <- ok & is.finite(xn)
  if (!is.null(yn)) ok <- ok & is.finite(yn)
  x <- x[ok]; y <- y[ok]; t <- t[ok]
  if (!is.null(xn)) xn <- xn[ok]
  if (!is.null(yn)) yn <- yn[ok]
  if (length(t) < 3) return(empty)
  o <- order(t)
  x <- x[o]; y <- y[o]; t <- t[o]
  if (!is.null(xn)) xn <- xn[o]
  if (!is.null(yn)) yn <- yn[o]
  n <- length(t)
  disp_ab <- function(a, b) (max(x[a:b]) - min(x[a:b])) + (max(y[a:b]) - min(y[a:b]))
  out <- vector("list", n)
  nfix <- 0L
  i <- 1L
  while (i <= n) {
    j <- i
    while (j <= n && (t[j] - t[i]) < min_ms) j <- j + 1L
    if (j > n) break
    if (disp_ab(i, j) > D) {
      i <- i + 1L
      next
    }
    k <- j
    while (k < n && disp_ab(i, k + 1L) <= D) k <- k + 1L
    nfix <- nfix + 1L
    out[[nfix]] <- list(
      cx = mean(x[i:k]),
      cy = mean(y[i:k]),
      nx = if (is.null(xn)) NA_real_ else mean(xn[i:k]),
      ny = if (is.null(yn)) NA_real_ else mean(yn[i:k]),
      t0 = t[i],
      t1 = t[k],
      dur = t[k] - t[i],
      disp = disp_ab(i, k)
    )
    i <- k + 1L
  }
  if (nfix == 0L) return(empty)
  bind_rows(out[seq_len(nfix)])
}

summarize_idt <- function(fix, span_ms) {
  nfix <- nrow(fix)
  if (nfix == 0) {
    return(tibble(
      n_fixations = 0,
      mean_fix_dur_ms = NA_real_,
      fix_rate_per_s = if (is.finite(span_ms) && span_ms > 0) 0 else NA_real_,
      mean_fix_disp_px = NA_real_,
      fix_entropy = NA_real_,
      n_saccades = 0,
      median_saccade_vel_px_s = NA_real_,
      mean_saccade_amp_px = NA_real_
    ))
  }
  ent <- {
    xx <- fix$nx
    yy <- fix$ny
    ok <- is.finite(xx) & is.finite(yy)
    if (sum(ok) < 3) {
      NA_real_
    } else {
      bx <- cut(pmin(pmax(xx[ok], 0), 1), breaks = seq(0, 1, length.out = 7), include.lowest = TRUE)
      by <- cut(pmin(pmax(yy[ok], 0), 1), breaks = seq(0, 1, length.out = 7), include.lowest = TRUE)
      p <- as.numeric(table(bx, by))
      p <- p[p > 0] / sum(p)
      -sum(p * log(p))
    }
  }
  sacc <- tibble()
  if (nfix >= 2) {
    sacc <- tibble(
      amp = sqrt(diff(fix$cx)^2 + diff(fix$cy)^2),
      dt = pmax(fix$t0[-1] - fix$t1[-nfix], 1)
    ) %>%
      mutate(vel = amp / (dt / 1000))
  }
  tibble(
    n_fixations = nfix,
    mean_fix_dur_ms = finite_mean(fix$dur),
    fix_rate_per_s = if (is.finite(span_ms) && span_ms > 0) nfix / (span_ms / 1000) else NA_real_,
    mean_fix_disp_px = finite_mean(fix$disp),
    fix_entropy = ent,
    n_saccades = nrow(sacc),
    median_saccade_vel_px_s = if (nrow(sacc)) finite_med(sacc$vel) else NA_real_,
    mean_saccade_amp_px = if (nrow(sacc)) finite_mean(sacc$amp) else NA_real_
  )
}

args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", args, value = TRUE)
data_dir <- if (length(file_arg)) dirname(normalizePath(sub("^--file=", "", file_arg))) else "."
if (!length(list.files(data_dir, pattern = "\\.csv$"))) {
  alt <- "/Users/ajr115/Desktop/spinner-task/Analysis"
  if (dir.exists(alt)) data_dir <- alt
}
csv_files <- list.files(data_dir, pattern = "\\.csv$", full.names = TRUE)
setwd(data_dir)
stopifnot(length(csv_files) > 0)

data <- purrr::map_dfr(csv_files, function(path) {
  d <- readr::read_csv(
    path,
    col_types = readr::cols(.default = readr::col_character()),
    na = c("", "NA", "NaN", "NULL"),
    show_col_types = FALSE
  )
  d$source_file <- basename(path)
  d
})

char_keep <- intersect(
  c(
    "row_type", "subject", "run_mode", "session_code", "source_file",
    "phase", "trial_type", "spinner_type", "near_edge", "shape", "shape_trigger",
    "average_offset", "validation_points", "percent_in_roi", "val_point_median_px",
    "eye_tracking"
  ),
  names(data)
)

data <- data %>%
  mutate(
    across(where(is.character), ~ na_if(str_squish(.x), "")),
    across(setdiff(names(data), char_keep), ~ suppressWarnings(readr::parse_number(.x)))
  ) %>%
  mutate(
    participant_id = as.character(subject),
    # session_code is stored on trial rows only; one CSV = one session
    session_id = paste(participant_id, source_file, sep = "|"),
    spinner_type = factor(spinner_type, levels = WHEEL_LEVELS),
    main_task = !is.na(spinner_type) & spinner_type %in% WHEEL_LEVELS &
      !is.na(round) & is.na(bonus_round) &
      (is.na(phase) | !phase %in% c("spin_practice", "bonus")),
    is_test = !is.na(run_mode) & run_mode == "test"
  )

rounds <- data %>%
  filter(row_type == "trial", main_task, !is.na(flow), !is_test) %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  summarise(flow = first(flow), liking = first(liking), happiness = first(happiness),
            n_spins = first(n_spins), .groups = "drop")

spins <- data %>%
  filter(row_type == "spin", main_task, !is_test) %>%
  select(session_id, participant_id, round, spinner_type, spin_index,
         t_start, t_release, t_land)

gaze <- data %>%
  filter(
    row_type == "gaze", main_task, !is_test,
    !is.na(gaze_x), !is.na(gaze_y),
    !is.na(round), !is.na(spinner_type)
  ) %>%
  mutate(
    wx = gaze_x_norm,
    wy = gaze_y_norm,
    on_task = (on_needle == 1) | (on_wheel == 1)
  )

# longest / mean on-needle dwell (ms) while spinning
dwell <- gaze %>%
  filter(spinning == 1) %>%
  arrange(session_id, round, t) %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  mutate(
    run = cumsum(coalesce(on_needle, 0) != lag(coalesce(on_needle, 0), default = -1)),
    dt = pmin(pmax(t - lag(t), 0), 200)
  ) %>%
  filter(on_needle == 1, is.finite(dt)) %>%
  group_by(session_id, participant_id, round, spinner_type, run) %>%
  summarise(dwell_ms = sum(dt, na.rm = TRUE), .groups = "drop") %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  summarise(
    mean_needle_dwell_ms = finite_mean(dwell_ms),
    max_needle_dwell_ms = if (length(dwell_ms)) max(dwell_ms) else NA_real_,
    n_needle_dwells = n(),
    .groups = "drop"
  )

# sample-to-sample motion while spinning
jump <- gaze %>%
  filter(spinning == 1) %>%
  arrange(session_id, round, t) %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  mutate(
    dt = t - lag(t),
    jump = sqrt((gaze_x - lag(gaze_x))^2 + (gaze_y - lag(gaze_y))^2)
  ) %>%
  filter(is.finite(jump), is.finite(dt), dt > 0, dt < 200) %>%
  summarise(
    mean_jump_px = finite_mean(jump),
    med_jump_px = finite_med(jump),
    path_px_per_s = sum(jump, na.rm = TRUE) / (sum(dt, na.rm = TRUE) / 1000),
    .groups = "drop"
  )

# charge (hold) vs coast, and last 400 ms before land
epoch <- gaze %>%
  filter(spinning == 1) %>%
  left_join(
    spins %>%
      select(session_id, round, spin_index,
             spin_t_start = t_start, spin_t_release = t_release, spin_t_land = t_land),
    by = c("session_id", "round", "spin_index")
  ) %>%
  mutate(
    epoch = case_when(
      !is.na(spin_t_release) & t < spin_t_release ~ "charge",
      !is.na(spin_t_release) & t >= spin_t_release ~ "coast",
      TRUE ~ NA_character_
    ),
    ms_to_land = if_else(!is.na(spin_t_land), spin_t_land - t, NA_real_)
  )

epoch_sum <- epoch %>%
  filter(!is.na(epoch)) %>%
  group_by(session_id, participant_id, round, spinner_type, epoch) %>%
  summarise(
    prop_needle = finite_mean(on_needle == 1),
    dist_needle = finite_mean(dist_needle),
    .groups = "drop"
  ) %>%
  pivot_wider(
    names_from = epoch,
    values_from = c(prop_needle, dist_needle),
    names_glue = "{.value}_{epoch}"
  )
for (nm in c("prop_needle_charge", "prop_needle_coast",
             "dist_needle_charge", "dist_needle_coast")) {
  if (!nm %in% names(epoch_sum)) epoch_sum[[nm]] <- NA_real_
}
epoch_sum <- epoch_sum %>%
  mutate(needle_charge_minus_coast = prop_needle_charge - prop_needle_coast)

land_lock <- epoch %>%
  filter(is.finite(ms_to_land), ms_to_land >= 0) %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  summarise(
    prop_needle_last400 = finite_mean(on_needle[ms_to_land <= 400] == 1),
    dist_needle_last400 = finite_mean(dist_needle[ms_to_land <= 400]),
    dist_needle_early = finite_mean(dist_needle[ms_to_land >= 2000]),
    # negative slope = closer to needle as land approaches
    needle_slope = {
      ok <- is.finite(ms_to_land) & is.finite(dist_needle) & ms_to_land <= 4000
      if (sum(ok) < 8) NA_real_ else unname(coef(lm(dist_needle[ok] ~ ms_to_land[ok]))[2])
    },
    .groups = "drop"
  ) %>%
  mutate(needle_approach = dist_needle_early - dist_needle_last400)

# distractor: stay on needle vs look toward shape after onset
shape_win <- gaze %>%
  filter(!is.na(shape_visible), !is.na(dist_shape), !is.na(ms_from_onset)) %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  summarise(
    prop_needle_during_shape = finite_mean(on_needle[shape_visible == 1] == 1),
    mean_dist_shape_vis = finite_mean(dist_shape[shape_visible == 1]),
    prop_near_shape_400 = finite_mean(
      shape_visible == 1 & ms_from_onset >= 0 & ms_from_onset <= 400 &
        dist_shape <= coalesce(shape_size, 30)
    ),
    dist_shape_0_200 = finite_mean(dist_shape[shape_visible == 1 & ms_from_onset >= 0 & ms_from_onset <= 200]),
    dist_shape_400_800 = finite_mean(dist_shape[shape_visible == 1 & ms_from_onset >= 400 & ms_from_onset <= 800]),
    .groups = "drop"
  ) %>%
  mutate(shape_approach = dist_shape_0_200 - dist_shape_400_800)

# spatial concentration + AOI while spinning / idle
aoi <- gaze %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  summarise(
    n_gaze = n(),
    n_spin = sum(spinning == 1, na.rm = TRUE),
    prop_needle_spin = finite_mean(on_needle[spinning == 1] == 1),
    prop_wheel_spin = finite_mean(on_wheel[spinning == 1] == 1),
    prop_off_spin = finite_mean(on_task[spinning == 1] == 0),
    mean_dist_needle_spin = finite_mean(dist_needle[spinning == 1]),
    med_dist_needle_spin = finite_med(dist_needle[spinning == 1]),
    sd_wx_spin = finite_sd(wx[spinning == 1]),
    sd_wy_spin = finite_sd(wy[spinning == 1]),
    mean_wy_spin = finite_mean(wy[spinning == 1]),
    prop_needle_idle = finite_mean(on_needle[is.na(spinning) | spinning != 1] == 1),
    spatial_entropy = {
      xx <- wx[spinning == 1]
      yy <- wy[spinning == 1]
      ok <- is.finite(xx) & is.finite(yy)
      if (sum(ok) < 20) {
        NA_real_
      } else {
        bx <- cut(pmin(pmax(xx[ok], 0), 1), breaks = seq(0, 1, length.out = 7), include.lowest = TRUE)
        by <- cut(pmin(pmax(yy[ok], 0), 1), breaks = seq(0, 1, length.out = 7), include.lowest = TRUE)
        p <- as.numeric(table(bx, by))
        p <- p[p > 0] / sum(p)
        -sum(p * log(p))
      }
    },
    .groups = "drop"
  ) %>%
  mutate(
    gaze_spread = sqrt(sd_wx_spin^2 + sd_wy_spin^2),
    prop_needle_spin_minus_idle = prop_needle_spin - prop_needle_idle
  )

# Wu-style constructs from the raw stream (spinning samples for I-DT / saccades;
# all wheel samples for the gap / face-loss proxy).
spin_g <- gaze %>%
  filter(spinning == 1) %>%
  arrange(session_id, participant_id, round, t)

idt_by_wheel <- function(D) {
  spin_g %>%
    group_by(session_id, participant_id, round, spinner_type) %>%
    summarise(
      span_ms = if (n() >= 2) max(t, na.rm = TRUE) - min(t, na.rm = TRUE) else NA_real_,
      idt = list(idt_fixations(gaze_x, gaze_y, t, wx, wy, D = D, min_ms = 100)),
      .groups = "drop"
    ) %>%
    mutate(summ = purrr::map2(idt, span_ms, summarize_idt)) %>%
    unnest(summ) %>%
    select(-idt, -span_ms)
}

wu_d48 <- idt_by_wheel(48)
wu_d24 <- idt_by_wheel(24) %>%
  rename_with(~ paste0(.x, "_d24"), -c(session_id, participant_id, round, spinner_type))
wu_d72 <- idt_by_wheel(72) %>%
  rename_with(~ paste0(.x, "_d72"), -c(session_id, participant_id, round, spinner_type))

gap_sum <- gaze %>%
  arrange(session_id, participant_id, round, t) %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  mutate(dt = t - lag(t)) %>%
  summarise(
    span_ms = if (n() >= 2) max(t, na.rm = TRUE) - min(t, na.rm = TRUE) else NA_real_,
    n_gaps = sum(is.finite(dt) & dt > 80),
    gap_ms = sum(dt[is.finite(dt) & dt > 80], na.rm = TRUE),
    .groups = "drop"
  ) %>%
  mutate(
    gap_rate_per_s = if_else(is.finite(span_ms) & span_ms > 0, n_gaps / (span_ms / 1000), NA_real_),
    prop_time_in_gaps = if_else(is.finite(span_ms) & span_ms > 0, gap_ms / span_ms, NA_real_)
  ) %>%
  select(session_id, participant_id, round, spinner_type, gap_rate_per_s, prop_time_in_gaps)

# Face Landmarker iris rows (absent in older CSVs). Blinks: blendshape events
# (close >= 0.5, open <= 0.3) and EAR events with a per-session cutoff (close
# <= 0.75 x open-eye median, open >= 0.85 x). Agreement between the two is QC,
# not a flow candidate. pupil_iris is a webcam proxy, not Tobii mm.
BLINK_CLOSE <- 0.5
BLINK_OPEN <- 0.3
EAR_CLOSE_FRAC <- 0.75
EAR_OPEN_FRAC <- 0.85

iris_sum <- tibble(
  session_id = character(), participant_id = character(),
  round = numeric(), spinner_type = factor(levels = WHEEL_LEVELS),
  n_iris = integer(), prop_face_ok = numeric(), iris_valid_s = numeric(),
  blink_rate_per_s = numeric(), ear_blink_rate_per_s = numeric(),
  blink_agree_pct = numeric(), blink_kappa = numeric(),
  mean_pupil_iris = numeric(), mean_pupil_d_px = numeric(),
  mean_iris_d_px = numeric(), mean_head_dist_rel = numeric()
)
if ("row_type" %in% names(data) && any(data$row_type == "iris", na.rm = TRUE)) {
  iris <- data %>%
    filter(row_type == "iris", main_task, !is_test, !is.na(round), !is.na(spinner_type))
  if (nrow(iris) > 0) {
    blink_l <- if ("blink_l" %in% names(iris)) iris$blink_l else NA_real_
    blink_r <- if ("blink_r" %in% names(iris)) iris$blink_r else NA_real_
    ear_l <- if ("ear_l" %in% names(iris)) iris$ear_l else NA_real_
    ear_r <- if ("ear_r" %in% names(iris)) iris$ear_r else NA_real_
    iris$blink <- pmax(blink_l, blink_r, na.rm = TRUE)
    iris$blink[!is.finite(iris$blink)] <- NA_real_
    iris$ear <- pmin(ear_l, ear_r, na.rm = TRUE)
    iris$ear[!is.finite(iris$ear)] <- NA_real_
    iris$pupil_iris <- rowMeans(cbind(
      if ("pupil_iris_l" %in% names(iris)) iris$pupil_iris_l else NA_real_,
      if ("pupil_iris_r" %in% names(iris)) iris$pupil_iris_r else NA_real_
    ), na.rm = TRUE)
    iris$pupil_d_px <- rowMeans(cbind(
      if ("pupil_d_px_l" %in% names(iris)) iris$pupil_d_px_l else NA_real_,
      if ("pupil_d_px_r" %in% names(iris)) iris$pupil_d_px_r else NA_real_
    ), na.rm = TRUE)
    iris$iris_d_px <- rowMeans(cbind(
      if ("iris_d_px_l" %in% names(iris)) iris$iris_d_px_l else NA_real_,
      if ("iris_d_px_r" %in% names(iris)) iris$iris_d_px_r else NA_real_
    ), na.rm = TRUE)
    if (!"face_ok" %in% names(iris)) iris$face_ok <- NA_real_
    if (!"head_dist_rel" %in% names(iris)) iris$head_dist_rel <- NA_real_

    # open-eye EAR baseline per session (samples the blendshape calls open)
    iris <- iris %>%
      group_by(session_id) %>%
      mutate(ear_base = finite_med(ear[face_ok == 1 & !is.na(blink) & blink <= BLINK_OPEN])) %>%
      ungroup()

    iris_sum <- iris %>%
      group_by(session_id, participant_id, round, spinner_type) %>%
      group_modify(function(d, key) {
        bs <- detect_blinks(d$t, d$blink, d$face_ok, BLINK_CLOSE, BLINK_OPEN)
        base <- d$ear_base[1]
        er <- if (is.finite(base)) {
          detect_blinks(d$t, d$ear, d$face_ok, EAR_CLOSE_FRAC * base, EAR_OPEN_FRAC * base, below = TRUE)
        } else {
          list(rate = NA_real_, closed = rep(NA, nrow(d)))
        }
        both <- !is.na(bs$closed) & !is.na(er$closed)
        tibble(
          n_iris = nrow(d),
          prop_face_ok = finite_mean(d$face_ok == 1),
          iris_valid_s = bs$valid_s,
          blink_rate_per_s = bs$rate,
          ear_blink_rate_per_s = er$rate,
          blink_agree_pct = if (sum(both) >= 10) 100 * mean(bs$closed[both] == er$closed[both]) else NA_real_,
          blink_kappa = cohen_kappa(bs$closed, er$closed),
          mean_pupil_iris = finite_mean(d$pupil_iris),
          mean_pupil_d_px = finite_mean(d$pupil_d_px),
          mean_iris_d_px = finite_mean(d$iris_d_px),
          mean_head_dist_rel = finite_mean(d$head_dist_rel)
        )
      }) %>%
      ungroup()
  }
}

# QC per wheel: logged timing on the wheel trial when present; otherwise the
# WebGazer rate is reconstructed from the gaze rows (older CSVs).
for (nm in c("wg_hz", "raf_fps", "long_frames", "wg_max_gap_ms", "iris_hz", "val_median_offset_px")) {
  if (!nm %in% names(data)) data[[nm]] <- NA_real_
}

gaze_rate <- gaze %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  summarise(
    gaze_hz_rows = if (n() >= 2 && diff(range(t, na.rm = TRUE)) > 0)
      (n() - 1) / (diff(range(t, na.rm = TRUE)) / 1000) else NA_real_,
    .groups = "drop"
  )

timing_wheel <- data %>%
  filter(row_type == "trial", main_task, !is_test, !is.na(round), !is.na(spinner_type),
         !is.na(wg_hz) | !is.na(raf_fps)) %>%
  group_by(session_id, participant_id, round, spinner_type) %>%
  dplyr::slice_max(coalesce(wg_hz, 0), n = 1, with_ties = FALSE) %>%
  ungroup() %>%
  select(session_id, participant_id, round, spinner_type,
         wg_hz_logged = wg_hz, raf_fps, long_frames, wg_max_gap_ms, iris_hz)

val_pre <- data %>%
  filter(row_type == "trial", phase == "eyetracking_validation_pre") %>%
  group_by(session_id, participant_id) %>%
  dplyr::slice_tail(n = 1) %>%
  ungroup() %>%
  select(session_id, participant_id, val_pre_median_px = val_median_offset_px)

qc_wheel <- gaze_rate %>%
  full_join(timing_wheel, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(val_pre, by = c("session_id", "participant_id")) %>%
  mutate(wg_hz_qc = coalesce(wg_hz_logged, gaze_hz_rows))

feat <- aoi %>%
  left_join(dwell, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(jump, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(epoch_sum, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(land_lock, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(shape_win, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(wu_d48, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(wu_d24, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(wu_d72, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(gap_sum, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(iris_sum, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  left_join(qc_wheel, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  inner_join(rounds, by = c("session_id", "participant_id", "round", "spinner_type")) %>%
  group_by(participant_id) %>%
  mutate(flow_w = flow - mean(flow, na.rm = TRUE)) %>%
  ungroup()

labels <- c(
  prop_needle_spin = "Needle AOI while spinning",
  prop_wheel_spin = "Wheel AOI while spinning",
  prop_off_spin = "Off needle+wheel while spinning",
  mean_dist_needle_spin = "Mean distance to needle (spin)",
  med_dist_needle_spin = "Median distance to needle (spin)",
  gaze_spread = "Gaze spread (SD of viewport-normalized x,y)",
  spatial_entropy = "Spatial entropy of spinning gaze",
  mean_wy_spin = "Mean vertical position (0 top, 1 bottom)",
  mean_jump_px = "Mean sample-to-sample jump (px)",
  med_jump_px = "Median sample-to-sample jump (px)",
  path_px_per_s = "Gaze path length (px/s)",
  mean_needle_dwell_ms = "Mean on-needle dwell (ms)",
  max_needle_dwell_ms = "Longest on-needle dwell (ms)",
  n_needle_dwells = "Number of needle dwells",
  prop_needle_charge = "Needle AOI during space-bar hold",
  prop_needle_coast = "Needle AOI during coast",
  needle_charge_minus_coast = "Needle AOI hold minus coast",
  prop_needle_last400 = "Needle AOI in last 400 ms before land",
  dist_needle_last400 = "Needle distance in last 400 ms",
  needle_approach = "Needle approach (early minus late dist.)",
  needle_slope = "Slope: needle distance ~ ms-to-land",
  prop_needle_during_shape = "Needle AOI while a shape is visible",
  mean_dist_shape_vis = "Mean distance to visible shape",
  prop_near_shape_400 = "Near-shape in first 400 ms after onset",
  shape_approach = "Shape approach (0–200 minus 400–800 ms)",
  prop_needle_idle = "Needle AOI while idle",
  prop_needle_spin_minus_idle = "Needle AOI spinning minus idle",
  n_gaze = "Number of gaze samples",
  n_fixations = "I-DT fixations (D=48 px)",
  mean_fix_dur_ms = "Mean I-DT fixation duration (ms)",
  fix_rate_per_s = "I-DT fixation rate (per s)",
  mean_fix_disp_px = "Mean I-DT fixation dispersion (px)",
  fix_entropy = "Entropy of I-DT fixation centroids",
  n_saccades = "I-DT saccades (D=48 px)",
  median_saccade_vel_px_s = "Median inter-fixation saccade vel. (px/s)",
  mean_saccade_amp_px = "Mean saccade amplitude (px)",
  gap_rate_per_s = "Gap rate >80 ms (face-loss/blink proxy, per s)",
  prop_time_in_gaps = "Proportion of time in >80 ms gaps",
  n_fixations_d24 = "I-DT fixations (D=24 px)",
  fix_rate_per_s_d24 = "I-DT fixation rate (D=24)",
  median_saccade_vel_px_s_d24 = "Median saccade vel. (D=24, px/s)",
  fix_entropy_d24 = "Fixation-centroid entropy (D=24)",
  n_fixations_d72 = "I-DT fixations (D=72 px)",
  fix_rate_per_s_d72 = "I-DT fixation rate (D=72)",
  median_saccade_vel_px_s_d72 = "Median saccade vel. (D=72, px/s)",
  fix_entropy_d72 = "Fixation-centroid entropy (D=72)",
  blink_rate_per_s = "Blink rate (blendshape events, per valid s)",
  ear_blink_rate_per_s = "Blink rate (per-session EAR events, per valid s)",
  mean_pupil_iris = "Mean pupil/iris ratio (webcam proxy)",
  mean_pupil_d_px = "Mean pupil diameter (px, webcam proxy)",
  mean_iris_d_px = "Mean iris diameter (px; distance confound)",
  mean_head_dist_rel = "Relative head distance from iris size (covariate)",
  n_iris = "Number of Face Landmarker samples",
  prop_face_ok = "Proportion of iris samples with a face"
)

family <- c(
  spatial_entropy = "ours",
  shape_approach = "ours",
  n_fixations = "wu_fixation",
  mean_fix_dur_ms = "wu_fixation",
  fix_rate_per_s = "wu_fixation",
  mean_fix_disp_px = "wu_fixation",
  fix_entropy = "wu_fixation",
  n_saccades = "wu_saccade",
  median_saccade_vel_px_s = "wu_saccade",
  mean_saccade_amp_px = "wu_saccade",
  mean_jump_px = "cousin",
  med_jump_px = "cousin",
  path_px_per_s = "cousin",
  gap_rate_per_s = "wu_gap",
  prop_time_in_gaps = "wu_gap",
  n_fixations_d24 = "sensitivity",
  fix_rate_per_s_d24 = "sensitivity",
  median_saccade_vel_px_s_d24 = "sensitivity",
  fix_entropy_d24 = "sensitivity",
  n_fixations_d72 = "sensitivity",
  fix_rate_per_s_d72 = "sensitivity",
  median_saccade_vel_px_s_d72 = "sensitivity",
  fix_entropy_d72 = "sensitivity",
  blink_rate_per_s = "wu_blink",
  ear_blink_rate_per_s = "wu_blink",
  mean_pupil_iris = "wu_pupil",
  mean_pupil_d_px = "wu_pupil",
  mean_iris_d_px = "wu_pupil",
  mean_head_dist_rel = "wu_pupil"
)
family <- c(family, setNames(rep("other", length(setdiff(names(labels), names(family)))),
                            setdiff(names(labels), names(family))))

measure_names <- names(labels)

assoc <- function(x, y) {
  ok <- is.finite(x) & is.finite(y)
  n <- sum(ok)
  if (n < 5) {
    return(list(n = n, pearson = NA, spearman = NA, p_pearson = NA, p_spearman = NA))
  }
  pt <- try(cor.test(x[ok], y[ok], method = "pearson"), silent = TRUE)
  st <- try(cor.test(x[ok], y[ok], method = "spearman", exact = FALSE), silent = TRUE)
  list(
    n = n,
    pearson = if (inherits(pt, "try-error")) NA else unname(pt$estimate),
    p_pearson = if (inherits(pt, "try-error")) NA else pt$p.value,
    spearman = if (inherits(st, "try-error")) NA else unname(st$estimate),
    p_spearman = if (inherits(st, "try-error")) NA else st$p.value
  )
}

# residualize on spinner type (character-safe)
resid_on_wheel <- function(y, wheel) {
  d <- tibble(y = y, wheel = wheel)
  ok <- is.finite(d$y) & !is.na(d$wheel)
  out <- rep(NA_real_, nrow(d))
  if (sum(ok) < 8) return(out)
  fit <- try(lm(y ~ wheel, data = d[ok, ]), silent = TRUE)
  if (inherits(fit, "try-error")) return(out)
  out[ok] <- residuals(fit)
  out
}

rows <- lapply(measure_names, function(nm) {
  x <- feat[[nm]]
  raw <- assoc(x, feat$flow)
  w <- assoc(x - ave(x, feat$participant_id, FUN = function(z) mean(z, na.rm = TRUE)), feat$flow_w)
  xr <- resid_on_wheel(x, feat$spinner_type)
  yr <- resid_on_wheel(feat$flow, feat$spinner_type)
  part <- assoc(xr, yr)
  tibble(
    measure = nm,
    label = unname(labels[[nm]]),
    family = unname(family[[nm]]),
    n = raw$n,
    r_pearson = raw$pearson,
    p_pearson = raw$p_pearson,
    r_spearman = raw$spearman,
    p_spearman = raw$p_spearman,
    r_within = w$pearson,
    p_within = w$p_pearson,
    r_partial = part$pearson,
    p_partial = part$p_pearson,
    abs_pearson = abs(raw$pearson),
    abs_within = abs(w$pearson),
    abs_partial = abs(part$pearson)
  )
})

tab <- bind_rows(rows) %>%
  arrange(desc(abs_within), desc(abs_pearson))

cat("Wheels:", nrow(feat), " participants:", n_distinct(feat$participant_id), "\n")
print(tab %>% mutate(across(where(is.numeric), ~ round(.x, 3))), n = 40)

# scatter points for the top within-person measure
top_nm <- tab$measure[which.max(replace(tab$abs_within, !is.finite(tab$abs_within), -Inf))]
if (!length(top_nm) || !is.finite(top_nm) || is.na(top_nm)) {
  top_nm <- tab$measure[which.max(replace(tab$abs_pearson, !is.finite(tab$abs_pearson), -Inf))]
}
if (!length(top_nm) || is.na(top_nm)) top_nm <- "prop_needle_spin"

scatter <- feat %>%
  transmute(
    participant_id,
    spinner_type = as.character(spinner_type),
    round,
    flow,
    value = .data[[top_nm]]
  ) %>%
  filter(is.finite(flow), is.finite(value)) %>%
  mutate(value = round(value, 4))

# Does each candidate measure track data quality rather than (or as well as) flow?
qc_vars <- c(
  wg_hz_qc = "WebGazer rate (Hz)",
  raf_fps = "Display frame rate (fps)",
  long_frames = "Long frames > 50 ms",
  val_pre_median_px = "Pre-check median offset (px)"
)
qc_tab <- bind_rows(lapply(measure_names, function(nm) {
  bind_rows(lapply(names(qc_vars), function(q) {
    a <- assoc(feat[[nm]], feat[[q]])
    tibble(measure = nm, label = unname(labels[[nm]]), qc = q,
           n = a$n, r_qc = a$pearson, p_qc = a$p_pearson)
  }))
})) %>%
  left_join(tab %>% select(measure, r_flow = r_pearson, r_within), by = "measure")

meta <- list(
  n_participants = n_distinct(feat$participant_id),
  n_wheels = nrow(feat),
  n_gaze = nrow(gaze),
  top_within = top_nm,
  top_pearson = tab$measure[which.max(tab$abs_pearson)],
  top_partial = tab$measure[which.max(tab$abs_partial)]
)

write_json(
  list(
    meta = meta,
    table = tab,
    scatter = scatter,
    qc_confounds = qc_tab,
    feat_head = feat %>%
      select(participant_id, spinner_type, round, flow, any_of(c(top_nm, "prop_needle_spin", "prop_needle_during_shape")))
  ),
  "flow_gaze_eda.json",
  digits = 4,
  pretty = TRUE,
  na = "null",
  dataframe = "rows",
  auto_unbox = TRUE
)

cat("Wheels:", nrow(feat), " participants:", n_distinct(feat$participant_id), "\n")
print(tab %>% mutate(across(where(is.numeric), ~ round(.x, 3))), n = 40)
cat("\nTop |within-person r|:", tab$label[1], " r_w =", round(tab$r_within[1], 3), "\n")
cat("Top |Pearson r|:", tab$label[which.max(tab$abs_pearson)],
    " r =", round(tab$r_pearson[which.max(tab$abs_pearson)], 3), "\n")
cat("Top |partial r| (control spinner):", tab$label[which.max(tab$abs_partial)],
    " r =", round(tab$r_partial[which.max(tab$abs_partial)], 3), "\n")

wu_tab <- tab %>% filter(family %in% c(
  "ours", "wu_fixation", "wu_saccade", "wu_gap", "wu_blink", "wu_pupil", "cousin"
))
cat("\n--- Wu-style vs our top two (and saccade cousins) ---\n")
print(wu_tab %>%
        arrange(family, desc(abs_pearson)) %>%
        select(family, label, n, r_pearson, p_pearson, r_within, p_within, r_partial, p_partial) %>%
        mutate(across(where(is.numeric), ~ round(.x, 3))), n = 40)

sens <- tab %>% filter(family == "sensitivity")
cat("\n--- I-DT sensitivity (D = 24 / 48 / 72) ---\n")
print(tab %>%
        filter(measure %in% c(
          "n_fixations", "n_fixations_d24", "n_fixations_d72",
          "fix_rate_per_s", "fix_rate_per_s_d24", "fix_rate_per_s_d72",
          "median_saccade_vel_px_s", "median_saccade_vel_px_s_d24", "median_saccade_vel_px_s_d72",
          "fix_entropy", "fix_entropy_d24", "fix_entropy_d72"
        )) %>%
        select(label, n, r_pearson, p_pearson, r_within, r_partial) %>%
        mutate(across(where(is.numeric), ~ round(.x, 3))), n = 20)

cat("\n--- QC: per-wheel data quality (WebGazer rate is from gaze rows when not logged) ---\n")
print(feat %>%
        summarise(across(any_of(names(qc_vars)),
                         list(median = ~ median(.x, na.rm = TRUE), n = ~ sum(is.finite(.x))))) %>%
        mutate(across(where(is.numeric), ~ round(.x, 1))))

cat("\n--- QC: blink method agreement (blendshape vs per-session EAR) ---\n")
if (nrow(iris_sum) > 0) {
  rate_r <- assoc(iris_sum$blink_rate_per_s, iris_sum$ear_blink_rate_per_s)
  print(iris_sum %>%
          summarise(
            wheels = n(),
            median_valid_s = median(iris_valid_s, na.rm = TRUE),
            median_agree_pct = median(blink_agree_pct, na.rm = TRUE),
            median_kappa = median(blink_kappa, na.rm = TRUE),
            r_rates = rate_r$pearson
          ) %>%
          mutate(across(where(is.numeric), ~ round(.x, 3))))
} else {
  cat("No iris rows in these CSVs.\n")
}

cat("\n--- QC confounds: candidate measures most correlated with a quality variable ---\n")
print(qc_tab %>%
        filter(is.finite(r_qc)) %>%
        arrange(desc(abs(r_qc))) %>%
        mutate(qc = unname(qc_vars[qc])) %>%
        select(label, qc, n, r_qc, p_qc, r_flow, r_within) %>%
        mutate(across(where(is.numeric), ~ round(.x, 3))), n = 15)
