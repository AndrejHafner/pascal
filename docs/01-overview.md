# 01 — Overview

## What is Pascal?

Pascal is a finger strength training app designed for climbers. It enables finger strength testing using the Bluetooth force measuring devices like Tindeq or Weiheng WH-06 and then enables training sessions based on the testing results. It's currently meant to be used by me but I will also open source it.

## Goals

What does v1 need to do to be considered a success:
- Connect to the force device over BLE and stream live readings on a plot
- Run a defined set of test/training protocols
- Log and review historical session data
- Analyze historic data and see the progression through time 
- Export data
- Have testing protocols where we test max pull and similar and log them, so that further trainings can be based on a percentage of max pull

## Non-goals

- Cloud sync / multi-device
- User accounts / auth
- Social features, leaderboards
- Support for multiple simultaneous BLE devices

## Target users

The owner and the app will be open source to be potentially used by others.

## Success criteria

The app will be working when will be able to connect to the device and log a full workout consisting of multiple sets of exercises where we have to pull the block pull (from the ground up, with weights) for a specific amount of time. The time under force should only be measure when we pull at the target force or within a certain boundary, since we won't be able to consistenly pull an exact number. We would also like to log these workouts and havea history of them and analyze how we progress through time.
