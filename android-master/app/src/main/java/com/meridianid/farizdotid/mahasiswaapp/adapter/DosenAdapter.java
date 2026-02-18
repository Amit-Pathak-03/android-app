package com.meridianid.farizdotid.mahasiswaapp.adapter;

import android.graphics.Color;
import android.support.annotation.NonNull;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import com.amulyakhare.textdrawable.TextDrawable;
import com.meridianid.farizdotid.mahasiswaapp.R;
import com.meridianid.farizdotid.mahasiswaapp.model.SemuadosenItem;

import java.util.List;
import java.util.Random;

public class DosenAdapter extends RecyclerView.Adapter<DosenAdapter.DosenHolder> {

    private final List<SemuadosenItem> semuadosenItemList;
    private final Random randomGenerator = new Random();

    private static final String[] COLORS = {
            "#39add1", "#3079ab", "#c25975", "#e15258", "#f9845b",
            "#838cc7", "#7d669e", "#53bbb4", "#51b46d", "#e0ab18",
            "#637a91", "#f092b0", "#b7c0c7"
    };

    public DosenAdapter(List<SemuadosenItem> dosenList) {
        this.semuadosenItemList = dosenList;
    }

    @NonNull
    @Override
    public DosenHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_dosen, parent, false);
        return new DosenHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull DosenHolder holder, int position) {
        SemuadosenItem item = semuadosenItemList.get(position);
        
        if (item != null) {
            holder.bind(item);
        }
    }

    @Override
    public int getItemCount() {
        return semuadosenItemList != null ? semuadosenItemList.size() : 0;
    }

    // --- ViewHolder Class ---
    
    public class DosenHolder extends RecyclerView.ViewHolder {
        
        // Manual binding if not using ViewBinding library yet
        private final ImageView ivTextDrawable;
        private final TextView tvNamaDosen;
        private final TextView tvNamaMatkul;

        public DosenHolder(View itemView) {
            super(itemView);
            ivTextDrawable = itemView.findViewById(R.id.ivTextDrawable);
            tvNamaDosen = itemView.findViewById(R.id.tvNamaDosen);
            tvNamaMatkul = itemView.findViewById(R.id.tvNamaMatkul);
        }

        public void bind(SemuadosenItem item) {
            tvNamaDosen.setText(item.getNama());
            tvNamaMatkul.setText(item.getMatkul());

            String firstChar = (item.getNama() != null && !item.getNama().isEmpty()) 
                               ? item.getNama().substring(0, 1) : "?";

            TextDrawable drawable = TextDrawable.builder()
                    .buildRound(firstChar, getRandomColor());
            
            ivTextDrawable.setImageDrawable(drawable);
        }
    }

    private int getRandomColor() {
        int index = randomGenerator.nextInt(COLORS.length);
        return Color.parseColor(COLORS[index]);
    }
}
