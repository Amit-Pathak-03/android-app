package com.meridianid.farizdotid.mahasiswaapp.activity;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.support.annotation.NonNull;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
import android.view.View;
import android.widget.Toast;

import com.meridianid.farizdotid.mahasiswaapp.databinding.ActivityLoginBinding;
import com.meridianid.farizdotid.mahasiswaapp.util.SharedPrefManager;
import com.meridianid.farizdotid.mahasiswaapp.util.api.BaseApiService;
import com.meridianid.farizdotid.mahasiswaapp.util.api.UtilsApi;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

import okhttp3.ResponseBody;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class LoginActivity extends AppCompatActivity {

    private ActivityLoginBinding binding;
    private BaseApiService mApiService;
    private SharedPrefManager sharedPrefManager;
    private Context mContext;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 1. Initialize View Binding
        binding = ActivityLoginBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        
        if (getSupportActionBar() != null) getSupportActionBar().hide();

        initDependencies();
        checkSession();
        setupClickListeners();
    }

    private void initDependencies() {
        mContext = this;
        mApiService = UtilsApi.getAPIService();
        sharedPrefManager = new SharedPrefManager(this);
    }

    private void checkSession() {
        if (sharedPrefManager.getSPSudahLogin()) {
            navigateToMain();
        }
    }

    private void setupClickListeners() {
        binding.btnLogin.setOnClickListener(v -> {
            showLoading(true);
            requestLogin();
        });

        binding.btnRegister.setOnClickListener(v -> 
            startActivity(new Intent(mContext, RegisterActivity.class))
        );
    }

    private void requestLogin() {
        String email = binding.etEmail.getText().toString();
        String password = binding.etPassword.getText().toString();

        mApiService.loginRequest(email, password)
                .enqueue(new Callback<ResponseBody>() {
                    @Override
                    public void onResponse(@NonNull Call<ResponseBody> call, @NonNull Response<ResponseBody> response) {
                        showLoading(false);
                        if (response.isSuccessful() && response.body() != null) {
                            handleLoginSuccess(response.body());
                        } else {
                            Toast.makeText(mContext, "Gagal terhubung ke server", Toast.LENGTH_SHORT).show();
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<ResponseBody> call, @NonNull Throwable t) {
                        Log.e("LoginActivity", "onFailure: " + t.getMessage());
                        showLoading(false);
                        Toast.makeText(mContext, "Masalah Koneksi", Toast.LENGTH_SHORT).show();
                    }
                });
    }

    private void handleLoginSuccess(ResponseBody body) {
        try {
            // Recommendation: Use GSON/Moshi to map this automatically in the future
            JSONObject jsonRESULTS = new JSONObject(body.string());
            if (jsonRESULTS.getString("error").equals("false")) {
                String nama = jsonRESULTS.getJSONObject("user").getString("nama");
                
                sharedPrefManager.saveSPString(SharedPrefManager.SP_NAMA, nama);
                sharedPrefManager.saveSPBoolean(SharedPrefManager.SP_SUDAH_LOGIN, true);
                
                Toast.makeText(mContext, "BERHASIL LOGIN", Toast.LENGTH_SHORT).show();
                navigateToMain();
            } else {
                String errorMsg = jsonRESULTS.optString("error_msg", "Login Gagal");
                Toast.makeText(mContext, errorMsg, Toast.LENGTH_SHORT).show();
            }
        } catch (JSONException | IOException e) {
            Log.error("LoginActivity", "Parsing error", e);
        }
    }

    // private void navigateToMain() {
    //     Intent intent = new Intent(mContext, MainActivity.class);
    //     intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
    //     startActivity(intent);
    //     finish();
    // }

    private void showLoading(boolean isLoading) {
        // Ideally, toggle a ProgressBar in your XML: 
        // binding.progressBar.setVisibility(isLoading ? View.VISIBLE : View.GONE);
        // binding.btnLogin.setEnabled(!isLoading);
        if (isLoading) {
            // Note: ProgressDialog is deprecated, use a ProgressBar in layout instead
            Toast.makeText(mContext, "Harap Tunggu...", Toast.LENGTH_SHORT).show();
        }
    }
}

